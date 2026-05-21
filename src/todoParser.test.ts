import { describe, expect, test } from "bun:test";
import { flatten, parseTodos } from "./todoParser";

describe("parseTodos", () => {
  test("ignores non-todo lines", () => {
    expect(parseTodos("just a paragraph\n# heading\n")).toEqual([]);
  });

  test("parses a single unchecked todo", () => {
    const result = parseTodos("- [ ] write tests");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      line: 1,
      indent: 0,
      checked: false,
      text: "write tests",
      children: [],
    });
  });

  test("recognises checked todos with [x] and [X]", () => {
    const result = parseTodos("- [x] lower\n- [X] upper");
    expect(result.map((t) => t.checked)).toEqual([true, true]);
  });

  test("accepts -, *, and + bullet markers", () => {
    const result = parseTodos("- [ ] dash\n* [ ] star\n+ [ ] plus");
    expect(result).toHaveLength(3);
  });

  test("nests sub-todos under their parent by indentation", () => {
    const md = [
      "- [ ] parent",
      "  - [ ] child A",
      "  - [x] child B",
      "- [ ] sibling",
    ].join("\n");

    const result = parseTodos(md);

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("parent");
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children.map((c) => c.text)).toEqual(["child A", "child B"]);
    expect(result[1].text).toBe("sibling");
  });

  test("supports arbitrarily deep nesting", () => {
    const md = [
      "- [ ] L0",
      "  - [ ] L1",
      "    - [ ] L2",
    ].join("\n");

    const result = parseTodos(md);
    expect(result[0].children[0].children[0].text).toBe("L2");
  });

  test("normalises tabs to four spaces when comparing indentation", () => {
    const md = "- [ ] parent\n\t- [ ] child";
    const result = parseTodos(md);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].text).toBe("child");
  });

  test("records 1-based line numbers", () => {
    const md = "intro\n\n- [ ] first\nmiddle\n- [ ] second";
    const result = parseTodos(md);
    expect(result.map((t) => t.line)).toEqual([3, 5]);
  });
});

describe("flatten", () => {
  test("returns nodes in document order with descendants inline", () => {
    const md = [
      "- [ ] A",
      "  - [ ] A1",
      "  - [ ] A2",
      "- [ ] B",
    ].join("\n");

    const flat = flatten(parseTodos(md));
    expect(flat.map((n) => n.text)).toEqual(["A", "A1", "A2", "B"]);
  });
});
