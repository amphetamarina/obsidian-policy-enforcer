import { describe, expect, test } from "bun:test";
import type { ClaudeClient, ClaudeResult } from "./claudeClient";
import { evaluateNote, renderOutline } from "./engine";
import { parseTodos } from "./todoParser";

const stubClient = (results: ClaudeResult[]): ClaudeClient => {
  let i = 0;
  return {
    invoke: async () => results[i++] ?? { ok: false, text: "", error: "stub exhausted" },
  };
};

const recordingClient = (response: ClaudeResult): {
  client: ClaudeClient;
  prompts: string[];
} => {
  const prompts: string[] = [];
  return {
    prompts,
    client: {
      invoke: async (input) => {
        prompts.push(input.prompt);
        return response;
      },
    },
  };
};

describe("renderOutline", () => {
  test("flattens the tree with indentation, line number, state, and text", () => {
    const md = ["- [x] parent", "  - [ ] child", "- [ ] sibling"].join("\n");
    expect(renderOutline(parseTodos(md))).toBe(
      [
        "- line 1 [x] parent",
        "  - line 2 [ ] child",
        "- line 3 [ ] sibling",
      ].join("\n"),
    );
  });
});

describe("evaluateNote", () => {
  const policies = [
    { id: "deliverable", prompt: "checked todos must reference a deliverable" },
  ];

  test("returns parsed LLM violations", async () => {
    const md = "- [x] no deliverable";
    const claude = stubClient([
      { ok: true, text: JSON.stringify([{ line: 1, reason: "no link" }]) },
    ]);

    const violations = await evaluateNote({ noteContent: md, policies, claude });
    expect(violations).toEqual([
      { line: 1, policyId: "deliverable", reason: "no link" },
    ]);
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

  test("returns no violations when claude output is unparsable", async () => {
    const md = "- [x] thing";
    const claude = stubClient([{ ok: true, text: "I think there's no problem here." }]);
    expect(await evaluateNote({ noteContent: md, policies, claude })).toEqual([]);
  });

  test("returns no violations when claude fails", async () => {
    const md = "- [x] thing";
    const claude = stubClient([{ ok: false, text: "", error: "boom" }]);
    expect(await evaluateNote({ noteContent: md, policies, claude })).toEqual([]);
  });

  test("skips claude entirely when the note has no todos", async () => {
    const md = "just a paragraph\n# heading\n";
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

  test("evaluates policies on notes with only unchecked todos", async () => {
    const md = "- [ ] vague task";
    const { client, prompts } = recordingClient({
      ok: true,
      text: JSON.stringify([{ line: 1, reason: "too vague" }]),
    });

    const violations = await evaluateNote({ noteContent: md, policies, claude: client });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("line 1 [ ] vague task");
    expect(violations).toEqual([
      { line: 1, policyId: "deliverable", reason: "too vague" },
    ]);
  });

  test("includes the full todo outline (checked and unchecked) in the prompt", async () => {
    const md = ["- [x] done", "  - [ ] still open", "- [ ] solo"].join("\n");
    const { client, prompts } = recordingClient({ ok: true, text: "[]" });

    await evaluateNote({ noteContent: md, policies, claude: client });

    expect(prompts[0]).toContain("- line 1 [x] done");
    expect(prompts[0]).toContain("  - line 2 [ ] still open");
    expect(prompts[0]).toContain("- line 3 [ ] solo");
  });

  test("invokes claude once per policy in policies.md", async () => {
    const md = "- [x] thing";
    const twoPolicies = [
      { id: "a", prompt: "policy a" },
      { id: "b", prompt: "policy b" },
    ];
    const claude = stubClient([
      { ok: true, text: "[]" },
      { ok: true, text: JSON.stringify([{ line: 1, reason: "from b" }]) },
    ]);

    const violations = await evaluateNote({
      noteContent: md,
      policies: twoPolicies,
      claude,
    });

    expect(violations).toEqual([
      { line: 1, policyId: "b", reason: "from b" },
    ]);
  });
});
