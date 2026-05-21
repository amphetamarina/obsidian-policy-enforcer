export interface Policy {
  id: string;
  prompt: string;
}

const POLICY_HEADING = /^#\s+Policy:\s*(.*)$/;
const ANY_HEADING = /^#\s+/;

export function loadPolicies(markdown: string): Policy[] {
  const lines = markdown.split("\n");
  const policies: Policy[] = [];

  let current: { id: string; bodyLines: string[] } | null = null;

  const finish = () => {
    if (current === null) return;
    const prompt = current.bodyLines.join("\n").trim();
    policies.push({ id: current.id, prompt });
    current = null;
  };

  for (const line of lines) {
    const policyMatch = POLICY_HEADING.exec(line);
    if (policyMatch) {
      finish();
      const id = policyMatch[1].trim();
      if (id.length > 0) {
        current = { id, bodyLines: [] };
      }
      continue;
    }
    if (ANY_HEADING.test(line)) {
      finish();
      continue;
    }
    if (current !== null) {
      current.bodyLines.push(line);
    }
  }

  finish();
  return policies;
}
