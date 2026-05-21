import { describe, expect, test } from "bun:test";
import { rolloverIncompleteTodos } from "./rollover";

describe("rolloverIncompleteTodos", () => {
  test("returns today's content unchanged when previous has no incomplete todos", () => {
    const today = "# Today\n\n- [ ] new thing";
    expect(rolloverIncompleteTodos("- [x] all done", today)).toBe(today);
  });

  test("appends incomplete todos under a 'Carried over' heading", () => {
    const prev = "- [ ] still open";
    const today = "# 2026-05-21";

    const result = rolloverIncompleteTodos(prev, today);

    expect(result).toBe(
      "# 2026-05-21\n\n## Carried over\n\n- [ ] still open",
    );
  });

  test("skips completed todos and keeps only incomplete branches", () => {
    const prev = [
      "- [x] done parent",
      "- [ ] open parent",
      "  - [x] done child",
      "  - [ ] open child",
    ].join("\n");

    const result = rolloverIncompleteTodos(prev, "# Today");

    expect(result).toBe(
      [
        "# Today",
        "",
        "## Carried over",
        "",
        "- [ ] open parent",
        "  - [ ] open child",
      ].join("\n"),
    );
  });

  test("preserves indentation of nested incomplete todos", () => {
    const prev = [
      "- [ ] root",
      "  - [ ] mid",
      "    - [ ] leaf",
    ].join("\n");

    const result = rolloverIncompleteTodos(prev, "");

    expect(result).toContain("- [ ] root");
    expect(result).toContain("  - [ ] mid");
    expect(result).toContain("    - [ ] leaf");
  });

  test("is idempotent: a second pass does not duplicate carried items", () => {
    const prev = "- [ ] thing";
    const once = rolloverIncompleteTodos(prev, "# Today");
    const twice = rolloverIncompleteTodos(prev, once);
    expect(twice).toBe(once);
  });

  test("strips policy comments from carried-over todo text", () => {
    const prev = "- [ ] thing <!-- policy:p: r -->";
    const result = rolloverIncompleteTodos(prev, "# Today");
    expect(result).toContain("- [ ] thing");
    expect(result).not.toContain("policy:p");
  });

  test("only carries the incomplete subtree even from a checked parent that violates sub-todo rule", () => {
    const prev = [
      "- [x] parent claimed done",
      "  - [ ] but this is open",
    ].join("\n");

    const result = rolloverIncompleteTodos(prev, "# Today");
    expect(result).toContain("- [ ] but this is open");
    expect(result).not.toContain("parent claimed done");
  });
});
