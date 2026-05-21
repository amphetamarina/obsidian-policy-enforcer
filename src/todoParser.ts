export interface TodoNode {
  line: number;
  indent: number;
  checked: boolean;
  text: string;
  children: TodoNode[];
}

const TODO_LINE = /^(\s*)[-*+]\s\[( |x|X)\]\s?(.*)$/;

export function parseTodos(markdown: string): TodoNode[] {
  const lines = markdown.split("\n");
  const roots: TodoNode[] = [];
  const stack: TodoNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = TODO_LINE.exec(lines[i]);
    if (!match) continue;

    const indent = match[1].replace(/\t/g, "    ").length;
    const node: TodoNode = {
      line: i + 1,
      indent,
      checked: match[2].toLowerCase() === "x",
      text: match[3].trim(),
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

export function flatten(nodes: TodoNode[]): TodoNode[] {
  const out: TodoNode[] = [];
  const walk = (n: TodoNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}
