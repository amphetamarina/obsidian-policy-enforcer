import { describe, expect, test } from "bun:test";
import { applyViolations } from "./enforcer";

describe("applyViolations", () => {
  test("returns content unchanged when there are no violations", () => {
    const md = "- [x] done\n- [ ] open";
    expect(applyViolations(md, [])).toBe(md);
  });

  test("reverts [x] to [ ] on a flagged line and appends a comment", () => {
    const md = "- [x] no deliverable";
    const result = applyViolations(md, [
      { line: 1, policyId: "deliverable", reason: "no link or path" },
    ]);
    expect(result).toBe(
      "- [ ] no deliverable <!-- policy:deliverable: no link or path -->",
    );
  });

  test("preserves bullet style and indentation", () => {
    const md = "  * [X] tabby";
    const result = applyViolations(md, [
      { line: 1, policyId: "p", reason: "r" },
    ]);
    expect(result).toBe("  * [ ] tabby <!-- policy:p: r -->");
  });

  test("does not touch unchecked todos even if flagged", () => {
    const md = "- [ ] already open";
    const result = applyViolations(md, [
      { line: 1, policyId: "p", reason: "r" },
    ]);
    expect(result).toBe("- [ ] already open <!-- policy:p: r -->");
  });

  test("combines multiple violations on the same line", () => {
    const md = "- [x] bad todo";
    const result = applyViolations(md, [
      { line: 1, policyId: "a", reason: "r1" },
      { line: 1, policyId: "b", reason: "r2" },
    ]);
    expect(result).toBe(
      "- [ ] bad todo <!-- policy:a: r1 --> <!-- policy:b: r2 -->",
    );
  });

  test("is idempotent: re-running with the same violations does not stack comments", () => {
    const md = "- [x] bad";
    const violations = [{ line: 1, policyId: "p", reason: "r" }];
    const once = applyViolations(md, violations);
    const twice = applyViolations(once, violations);
    expect(twice).toBe(once);
  });

  test("strips stale policy comments when the violation set changes", () => {
    const start = "- [ ] thing <!-- policy:old: stale -->";
    const result = applyViolations(start, [
      { line: 1, policyId: "new", reason: "fresh" },
    ]);
    expect(result).toBe("- [ ] thing <!-- policy:new: fresh -->");
  });

  test("strips policy comments on lines that are no longer flagged", () => {
    const start = "- [ ] thing <!-- policy:old: stale -->";
    expect(applyViolations(start, [])).toBe("- [ ] thing");
  });

  test("ignores violations pointing at lines that are not todos", () => {
    const md = "just a paragraph";
    expect(applyViolations(md, [
      { line: 1, policyId: "p", reason: "r" },
    ])).toBe("just a paragraph");
  });

  test("rejects out-of-range line numbers gracefully", () => {
    const md = "- [x] one\n- [x] two";
    const result = applyViolations(md, [
      { line: 99, policyId: "p", reason: "r" },
    ]);
    expect(result).toBe(md);
  });
});
