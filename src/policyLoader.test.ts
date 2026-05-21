import { describe, expect, test } from "bun:test";
import { loadPolicies } from "./policyLoader";

describe("loadPolicies", () => {
  test("returns empty list when file has no policy headings", () => {
    expect(loadPolicies("# Just notes\nsome text")).toEqual([]);
  });

  test("parses a single policy", () => {
    const md = [
      "# Policy: deliverable-required",
      "",
      "A TODO marked complete must reference a deliverable.",
    ].join("\n");

    const result = loadPolicies(md);
    expect(result).toEqual([
      {
        id: "deliverable-required",
        prompt: "A TODO marked complete must reference a deliverable.",
      },
    ]);
  });

  test("parses multiple policies and preserves order", () => {
    const md = [
      "# Policy: a",
      "first prompt",
      "",
      "# Policy: b",
      "second prompt",
    ].join("\n");

    const result = loadPolicies(md);
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result[0].prompt).toBe("first prompt");
    expect(result[1].prompt).toBe("second prompt");
  });

  test("ignores non-policy headings and intro prose", () => {
    const md = [
      "# Vault policies",
      "intro paragraph",
      "",
      "# Policy: only-one",
      "body here",
    ].join("\n");

    const result = loadPolicies(md);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("only-one");
    expect(result[0].prompt).toBe("body here");
  });

  test("trims surrounding whitespace from the prompt body", () => {
    const md = [
      "# Policy: tidy",
      "",
      "",
      "the body",
      "",
      "",
    ].join("\n");

    expect(loadPolicies(md)[0].prompt).toBe("the body");
  });

  test("treats id as case-sensitive and rejects whitespace-only ids", () => {
    const md = "# Policy:   \nbody\n# Policy: real\nrealbody";
    const result = loadPolicies(md);
    expect(result).toEqual([{ id: "real", prompt: "realbody" }]);
  });
});
