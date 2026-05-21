import { parseTodos, type TodoNode } from "./todoParser";

const CARRIED_HEADING = "## Carried over";
const POLICY_COMMENT = /\s*<!--\s*policy:[^>]*-->/g;

export function rolloverIncompleteTodos(
  previousContent: string,
  todayContent: string,
): string {
  const carried = collectIncomplete(parseTodos(previousContent));
  if (carried.length === 0) return todayContent;

  const carriedBlock = renderCarriedBlock(carried);
  const existing = extractCarriedBlock(todayContent);

  if (existing === carriedBlock) return todayContent;

  const base = existing
    ? todayContent.replace(existing, carriedBlock)
    : appendBlock(todayContent, carriedBlock);

  return base;
}

interface CarriedTodo {
  indent: number;
  text: string;
}

function collectIncomplete(nodes: TodoNode[]): CarriedTodo[] {
  const out: CarriedTodo[] = [];

  const walk = (node: TodoNode, depth: number) => {
    if (!node.checked) {
      out.push({
        indent: depth * 2,
        text: stripPolicyComments(node.text),
      });
      node.children.forEach((c) => walk(c, depth + 1));
      return;
    }
    node.children.forEach((c) => walk(c, depth));
  };

  nodes.forEach((n) => walk(n, 0));
  return out;
}

function stripPolicyComments(text: string): string {
  return text.replace(POLICY_COMMENT, "").trim();
}

function renderCarriedBlock(items: CarriedTodo[]): string {
  const lines = items.map((it) => `${" ".repeat(it.indent)}- [ ] ${it.text}`);
  return [CARRIED_HEADING, "", ...lines].join("\n");
}

function extractCarriedBlock(content: string): string | null {
  const headingIndex = content.indexOf(CARRIED_HEADING);
  if (headingIndex === -1) return null;

  const rest = content.slice(headingIndex);
  const nextHeading = rest.slice(CARRIED_HEADING.length).search(/\n#{1,6}\s/);
  const block = nextHeading === -1
    ? rest
    : rest.slice(0, CARRIED_HEADING.length + nextHeading);

  return block.replace(/\s+$/, "");
}

function appendBlock(content: string, block: string): string {
  const trimmed = content.replace(/\s+$/, "");
  if (trimmed.length === 0) return block;
  return `${trimmed}\n\n${block}`;
}
