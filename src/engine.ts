import type { ClaudeClient, ClaudeLogger } from "./claudeClient";
import type { Policy } from "./policyLoader";

export interface PreviousDaily {
  path: string;
  content: string;
}

export interface EnforceContext {
  previousDaily?: PreviousDaily;
}

export interface EnforceInput {
  noteContent: string;
  notePath: string;
  policies: Policy[];
  claude: ClaudeClient;
  context?: EnforceContext;
  timeoutMs?: number;
  logger?: ClaudeLogger;
}

export type EnforceOutcome =
  | { kind: "unchanged" }
  | { kind: "rewritten"; content: string }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; error: string };

export async function enforceNote(input: EnforceInput): Promise<EnforceOutcome> {
  if (input.policies.length === 0) {
    return { kind: "skipped", reason: "no policies loaded" };
  }

  const prompt = buildPrompt(input);
  const result = await input.claude.invoke({
    prompt,
    timeoutMs: input.timeoutMs,
    logger: input.logger,
  });

  if (!result.ok) {
    return { kind: "error", error: result.error ?? "claude invocation failed" };
  }

  const rewritten = extractMarkdown(result.text);
  if (rewritten === null) {
    return { kind: "error", error: "empty response from claude" };
  }
  if (rewritten === input.noteContent) {
    return { kind: "unchanged" };
  }
  return { kind: "rewritten", content: rewritten };
}

export function extractMarkdown(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const fence = /```(?:markdown|md)?\s*\n([\s\S]*?)\n```/;
  const match = fence.exec(trimmed);
  if (match) return match[1];

  return trimmed;
}

function buildPrompt(input: EnforceInput): string {
  const lines: string[] = [
    "You are a markdown note policy enforcer. Read the policies and the current",
    "note content, then return the note rewritten so it complies with every",
    "policy. Make the MINIMUM edits required. Preserve the user's writing voice,",
    "headings, links, code blocks, and any formatting that the policies do not",
    "ask you to change. Do not invent content the user did not write.",
    "",
    "# Policies",
    "",
  ];

  for (const p of input.policies) {
    lines.push(`## ${p.id}`, p.prompt, "");
  }

  if (input.context?.previousDaily) {
    const pd = input.context.previousDaily;
    lines.push(
      "# Previous daily note",
      `Path: ${pd.path}. Provided so policies that reference yesterday's note`,
      "(for example, carrying open todos forward) can read it. Do NOT copy this",
      "content verbatim unless a policy explicitly says so.",
      "",
      "```markdown",
      pd.content,
      "```",
      "",
    );
  }

  lines.push(
    `# Current note (${input.notePath})`,
    "",
    "```markdown",
    input.noteContent,
    "```",
    "",
    "# Output format",
    "Return ONLY the rewritten note inside a single fenced markdown block:",
    "",
    "```markdown",
    "<the rewritten note here>",
    "```",
    "",
    "No preamble, no commentary, no diff format. If no changes are needed,",
    "return the note unchanged inside the block.",
  );

  return lines.join("\n");
}
