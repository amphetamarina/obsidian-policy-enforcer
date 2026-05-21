import type { ClaudeClient } from "./claudeClient";
import type { Policy } from "./policyLoader";
import { parseTodos, type TodoNode } from "./todoParser";

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

export async function evaluateNote(input: EvaluateInput): Promise<Violation[]> {
  const tree = parseTodos(input.noteContent);
  if (tree.length === 0) return [];

  const violations: Violation[] = [];
  const outline = renderOutline(tree);

  for (const policy of input.policies) {
    const prompt = buildPrompt(policy, input.noteContent, outline);
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

export function renderOutline(roots: TodoNode[]): string {
  const lines: string[] = [];
  const walk = (node: TodoNode, depth: number) => {
    const indent = "  ".repeat(depth);
    const box = node.checked ? "[x]" : "[ ]";
    lines.push(`${indent}- line ${node.line} ${box} ${node.text}`);
    node.children.forEach((c) => walk(c, depth + 1));
  };
  roots.forEach((n) => walk(n, 0));
  return lines.join("\n");
}

function buildPrompt(policy: Policy, noteContent: string, outline: string): string {
  return [
    "You are enforcing a single note policy. Read the policy and the note,",
    "then return ONLY a JSON array of violations. No prose, no preamble.",
    "",
    `# Policy: ${policy.id}`,
    policy.prompt,
    "",
    "# All TODOs in this note",
    "Each line shows: indentation (sub-todos are indented under their parent),",
    "the source line number, checkbox state ([ ] open, [x] complete), and text.",
    "",
    outline,
    "",
    "# Full note content",
    "```markdown",
    noteContent,
    "```",
    "",
    "# Output format",
    "Respond with a JSON array. Each element MUST have shape:",
    '  { "line": <number>, "reason": "<short explanation>" }',
    "Use the `line` number shown in the outline above.",
    "If there are no violations, respond with []. Do not wrap in code fences.",
  ].join("\n");
}
