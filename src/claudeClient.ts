import { spawn } from "child_process";

export interface ClaudeInvocation {
  prompt: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface ClaudeResult {
  ok: boolean;
  text: string;
  error?: string;
}

export interface ClaudeClient {
  invoke(input: ClaudeInvocation): Promise<ClaudeResult>;
}

export function parseCommand(command: string): { binary: string; prefixArgs: string[] } {
  const tokens = command.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return { binary: "claude", prefixArgs: [] };
  const [binary, ...prefixArgs] = tokens;
  return { binary, prefixArgs };
}

export class CliClaudeClient implements ClaudeClient {
  constructor(
    private readonly binary: string = "claude",
    private readonly prefixArgs: string[] = [],
  ) {}

  invoke(input: ClaudeInvocation): Promise<ClaudeResult> {
    return new Promise((resolve) => {
      const child = spawn(this.binary, [...this.prefixArgs, "-p"], {
        cwd: input.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timer: NodeJS.Timeout | undefined;
      let resolved = false;

      const settle = (result: ClaudeResult) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        settle({ ok: false, text: stdout, error: err.message });
      });

      child.on("close", (code) => {
        if (code === 0) {
          settle({ ok: true, text: stdout.trim() });
        } else {
          settle({
            ok: false,
            text: stdout,
            error: `claude exited with code ${code}: ${stderr.trim()}`,
          });
        }
      });

      if (input.timeoutMs && input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          settle({
            ok: false,
            text: stdout,
            error: `claude timed out after ${input.timeoutMs}ms`,
          });
        }, input.timeoutMs);
      }

      child.stdin.write(input.prompt);
      child.stdin.end();
    });
  }
}
