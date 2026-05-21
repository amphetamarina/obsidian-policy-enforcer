import { describe, expect, test } from "bun:test";
import { parseCommand } from "./claudeClient";

describe("parseCommand", () => {
  test("returns the default binary for an empty string", () => {
    expect(parseCommand("")).toEqual({ binary: "claude", prefixArgs: [] });
    expect(parseCommand("   ")).toEqual({ binary: "claude", prefixArgs: [] });
  });

  test("treats a single token as the binary with no prefix args", () => {
    expect(parseCommand("claude")).toEqual({ binary: "claude", prefixArgs: [] });
  });

  test("splits 'wsl claude' into wsl + [claude]", () => {
    expect(parseCommand("wsl claude")).toEqual({
      binary: "wsl",
      prefixArgs: ["claude"],
    });
  });

  test("collapses runs of whitespace and trims edges", () => {
    expect(parseCommand("  wsl.exe   -e   claude  ")).toEqual({
      binary: "wsl.exe",
      prefixArgs: ["-e", "claude"],
    });
  });
});
