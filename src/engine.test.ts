import { describe, expect, test } from "bun:test";
import type { ClaudeClient, ClaudeResult } from "./claudeClient";
import { enforceNote, extractMarkdown } from "./engine";

const stubClient = (result: ClaudeResult): ClaudeClient => ({
  invoke: async () => result,
});

const recordingClient = (
  result: ClaudeResult,
): { client: ClaudeClient; prompts: string[] } => {
  const prompts: string[] = [];
  return {
    prompts,
    client: { invoke: async (i) => (prompts.push(i.prompt), result) },
  };
};

const policies = [{ id: "p1", prompt: "do thing" }];

describe("extractMarkdown", () => {
  test("returns null on empty/whitespace input", () => {
    expect(extractMarkdown("")).toBeNull();
    expect(extractMarkdown("   \n\n")).toBeNull();
  });

  test("extracts content from a ```markdown fence", () => {
    const text = "preamble\n```markdown\nhello\nworld\n```\n";
    expect(extractMarkdown(text)).toBe("hello\nworld");
  });

  test("accepts ```md as an alias", () => {
    expect(extractMarkdown("```md\nhi\n```")).toBe("hi");
  });

  test("accepts an unlabelled fence", () => {
    expect(extractMarkdown("```\nhi\n```")).toBe("hi");
  });

  test("falls back to the trimmed raw text when no fence is present", () => {
    expect(extractMarkdown("just words")).toBe("just words");
  });
});

describe("enforceNote", () => {
  test("skips when no policies are loaded", async () => {
    const result = await enforceNote({
      noteContent: "x",
      notePath: "n.md",
      policies: [],
      claude: stubClient({ ok: true, text: "[]" }),
    });
    expect(result).toEqual({ kind: "skipped", reason: "no policies loaded" });
  });

  test("returns rewritten content when claude returns a different note", async () => {
    const claude = stubClient({
      ok: true,
      text: "```markdown\nNew body\n```",
    });
    const result = await enforceNote({
      noteContent: "Old body",
      notePath: "n.md",
      policies,
      claude,
    });
    expect(result).toEqual({ kind: "rewritten", content: "New body" });
  });

  test("returns unchanged when claude returns the same content", async () => {
    const claude = stubClient({
      ok: true,
      text: "```markdown\nSame\n```",
    });
    const result = await enforceNote({
      noteContent: "Same",
      notePath: "n.md",
      policies,
      claude,
    });
    expect(result).toEqual({ kind: "unchanged" });
  });

  test("returns error when claude fails", async () => {
    const result = await enforceNote({
      noteContent: "x",
      notePath: "n.md",
      policies,
      claude: stubClient({ ok: false, text: "", error: "boom" }),
    });
    expect(result).toEqual({ kind: "error", error: "boom" });
  });

  test("returns error when claude returns empty text", async () => {
    const result = await enforceNote({
      noteContent: "x",
      notePath: "n.md",
      policies,
      claude: stubClient({ ok: true, text: "" }),
    });
    expect(result.kind).toBe("error");
  });

  test("prompt includes every policy id and body", async () => {
    const { client, prompts } = recordingClient({
      ok: true,
      text: "```markdown\nx\n```",
    });
    await enforceNote({
      noteContent: "x",
      notePath: "today.md",
      policies: [
        { id: "alpha", prompt: "be alpha" },
        { id: "beta", prompt: "be beta" },
      ],
      claude: client,
    });
    expect(prompts[0]).toContain("alpha");
    expect(prompts[0]).toContain("be alpha");
    expect(prompts[0]).toContain("beta");
    expect(prompts[0]).toContain("be beta");
    expect(prompts[0]).toContain("today.md");
    expect(prompts[0]).toContain("```markdown\nx\n```");
  });

  test("prompt includes previous-daily context when provided", async () => {
    const { client, prompts } = recordingClient({
      ok: true,
      text: "```markdown\nx\n```",
    });
    await enforceNote({
      noteContent: "today body",
      notePath: "daily/2026-05-21.md",
      policies,
      claude: client,
      context: {
        previousDaily: {
          path: "daily/2026-05-20.md",
          content: "yesterday body",
        },
      },
    });
    expect(prompts[0]).toContain("daily/2026-05-20.md");
    expect(prompts[0]).toContain("yesterday body");
  });

  test("forwards the logger to the claude invocation", async () => {
    const seen: string[] = [];
    const claude: ClaudeClient = {
      invoke: async (i) => {
        i.logger?.({ kind: "request", command: "x", prompt: i.prompt });
        return { ok: true, text: "```markdown\nout\n```" };
      },
    };
    await enforceNote({
      noteContent: "in",
      notePath: "n.md",
      policies,
      claude,
      logger: (e) => seen.push(e.kind),
    });
    expect(seen).toEqual(["request"]);
  });
});
