import type { Violation } from "./engine";

const TODO_LINE = /^(\s*[-*+]\s)\[( |x|X)\](\s?)(.*)$/;
const POLICY_COMMENT = /\s*<!--\s*policy:[^>]*-->\s*$/;

export function applyViolations(content: string, violations: Violation[]): string {
  const byLine = new Map<number, Violation[]>();
  for (const v of violations) {
    const bucket = byLine.get(v.line) ?? [];
    bucket.push(v);
    byLine.set(v.line, bucket);
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const stripped = stripPolicyComments(original);
    const match = TODO_LINE.exec(stripped);
    if (!match) {
      lines[i] = stripped === original ? original : stripped;
      continue;
    }

    const lineViolations = byLine.get(i + 1) ?? [];
    const wantsRevert = lineViolations.length > 0 && match[2].toLowerCase() === "x";
    const checkbox = wantsRevert ? " " : match[2];
    const rebuilt = `${match[1]}[${checkbox}]${match[3]}${match[4]}`;
    const trimmed = rebuilt.replace(/\s+$/, "");
    const comments = lineViolations
      .map((v) => `<!-- policy:${v.policyId}: ${v.reason} -->`)
      .join(" ");

    lines[i] = comments.length > 0 ? `${trimmed} ${comments}` : trimmed;
  }

  return lines.join("\n");
}

function stripPolicyComments(line: string): string {
  let result = line;
  while (POLICY_COMMENT.test(result)) {
    result = result.replace(POLICY_COMMENT, "");
  }
  return result;
}
