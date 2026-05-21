import type { ClaudeClient } from "./claudeClient";
import type { Policy } from "./policyLoader";
import { flatten, parseTodos, type TodoNode } from "./todoParser";

export interface Violation {
  line: number;
  policyId: string;
  reason: string;
}

export interface EvaluateInput {
  noteContent: string;
  policies: Policy[];
  claude: ClaudeClient;
  timeoutMs?: number;
}

export function subTodoCompletionRule(roots: TodoNode[]): Violation[] {
  const violations: Violation[] = [];

  const hasUncheckedDescendant = (node: TodoNode): boolean =>
    node.children.some((c) => !c.checked || hasUncheckedDescendant(c));

  const walk = (node: TodoNode) => {
    if (node.checked && hasUncheckedDescendant(node)) {
      violations.push({
        line: node.line,
        policyId: "sub-todos-complete",
        reason: "Parent marked complete but a sub-todo is still open.",
      });
    }
    node.children.forEach(walk);
  };

  roots.forEach(walk);
  return violations;
}

export async function evaluateNote(input: EvaluateInput): Promise<Violation[]> {
  const tree = parseTodos(input.noteContent);
  const violations: Violation[] = [...subTodoCompletionRule(tree)];

  const checked = flatten(tree).filter((t) => t.checked);
  if (checked.length === 0) return violations;

  for (const policy of input.policies) {
    const prompt = buildPrompt(policy, input.noteContent, checked);
    const result = await input.claude.invoke({ prompt, timeoutMs: input.timeoutMs });
    if (!result.ok) continue;

    const parsed = parseClaudeJson(result.text);
    for (const entry of parsed) {
      violations.push({
        line: entry.line,
        policyId: policy.id,
        reason: entry.reason,
      });
    }
  }

  return violations;
}

interface RawViolation {
  line: number;
  reason: string;
}

function parseClaudeJson(text: string): RawViolation[] {
  const stripped = stripCodeFence(text).trim();
  if (stripped.length === 0) return [];

  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (
        entry &&
        typeof entry === "object" &&
        typeof entry.line === "number" &&
        typeof entry.reason === "string"
      ) {
        return [{ line: entry.line, reason: entry.reason }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function stripCodeFence(text: string): string {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/;
  const match = fence.exec(text.trim());
  return match ? match[1] : text;
}

function buildPrompt(policy: Policy, noteContent: string, checked: TodoNode[]): string {
  const checkedList = checked
    .map((t) => `- line ${t.line}: ${t.text}`)
    .join("\n");

  return [
    "You are enforcing a single note policy. Read the policy and the note,",
    "then return ONLY a JSON array of violations. No prose, no preamble.",
    "",
    `# Policy: ${policy.id}`,
    policy.prompt,
    "",
    "# Checked TODOs in this note",
    checkedList,
    "",
    "# Full note content",
    "```markdown",
    noteContent,
    "```",
    "",
    "# Output format",
    "Respond with a JSON array. Each element MUST have shape:",
    '  { "line": <number>, "reason": "<short explanation>" }',
    "If there are no violations, respond with []. Do not wrap in code fences.",
  ].join("\n");
}
