import { describe, expect, test } from "bun:test";
import type { ClaudeClient, ClaudeResult } from "./claudeClient";
import { evaluateNote, subTodoCompletionRule } from "./engine";
import { parseTodos } from "./todoParser";

const stubClient = (results: ClaudeResult[]): ClaudeClient => {
  let i = 0;
  return {
    invoke: async () => results[i++] ?? { ok: false, text: "", error: "stub exhausted" },
  };
};

describe("subTodoCompletionRule", () => {
  test("flags a checked parent with any unchecked descendant", () => {
    const md = [
      "- [x] parent",
      "  - [ ] missing child",
      "  - [x] done child",
    ].join("\n");

    const violations = subTodoCompletionRule(parseTodos(md));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      line: 1,
      policyId: "sub-todos-complete",
    });
  });

  test("passes when every descendant of a checked parent is checked", () => {
    const md = [
      "- [x] parent",
      "  - [x] a",
      "  - [x] b",
    ].join("\n");

    expect(subTodoCompletionRule(parseTodos(md))).toEqual([]);
  });

  test("ignores unchecked parents regardless of children state", () => {
    const md = [
      "- [ ] parent",
      "  - [ ] still working",
    ].join("\n");

    expect(subTodoCompletionRule(parseTodos(md))).toEqual([]);
  });

  test("flags every checked ancestor of an unchecked leaf", () => {
    const md = [
      "- [x] grand",
      "  - [x] mid",
      "    - [ ] leaf",
    ].join("\n");

    const violations = subTodoCompletionRule(parseTodos(md));
    expect(violations.map((v) => v.line).sort()).toEqual([1, 2]);
  });
});

describe("evaluateNote", () => {
  const policies = [
    { id: "deliverable", prompt: "checked todos must reference a deliverable" },
  ];

  test("returns built-in violations plus parsed LLM violations", async () => {
    const md = "- [x] parent\n  - [ ] child\n- [x] no deliverable";
    const claude = stubClient([
      {
        ok: true,
        text: JSON.stringify([
          { line: 3, reason: "no link or path" },
        ]),
      },
    ]);

    const violations = await evaluateNote({ noteContent: md, policies, claude });

    expect(violations).toContainEqual({
      line: 1,
      policyId: "sub-todos-complete",
      reason: expect.any(String),
    });
    expect(violations).toContainEqual({
      line: 3,
      policyId: "deliverable",
      reason: "no link or path",
    });
  });

  test("tolerates fenced JSON code blocks from claude", async () => {
    const md = "- [x] thing";
    const text = "```json\n[{\"line\": 1, \"reason\": \"missing\"}]\n```";
    const claude = stubClient([{ ok: true, text }]);

    const violations = await evaluateNote({ noteContent: md, policies, claude });
    expect(violations).toContainEqual({
      line: 1,
      policyId: "deliverable",
      reason: "missing",
    });
  });

  test("returns no LLM violations when claude output is unparsable", async () => {
    const md = "- [x] thing";
    const claude = stubClient([{ ok: true, text: "I think there's no problem here." }]);

    const violations = await evaluateNote({ noteContent: md, policies, claude });
    expect(violations.filter((v) => v.policyId === "deliverable")).toEqual([]);
  });

  test("returns no LLM violations when claude fails", async () => {
    const md = "- [x] thing";
    const claude = stubClient([{ ok: false, text: "", error: "boom" }]);

    const violations = await evaluateNote({ noteContent: md, policies, claude });
    expect(violations.filter((v) => v.policyId === "deliverable")).toEqual([]);
  });

  test("skips claude entirely when there are no checked todos", async () => {
    const md = "- [ ] not done\n- [ ] also not done";
    let calls = 0;
    const claude: ClaudeClient = {
      invoke: async () => {
        calls++;
        return { ok: true, text: "[]" };
      },
    };

    await evaluateNote({ noteContent: md, policies, claude });
    expect(calls).toBe(0);
  });
});
