# Obsidian Policy Enforcer

An Obsidian plugin that enforces note policies by shelling out to the
[Claude CLI](https://docs.claude.com/en/docs/claude-code/overview)
(`claude -p`). Policies are written in plain markdown in a file at
the vault root; the plugin sends every policy plus the current note
to Claude and writes back the rewritten content Claude returns.

## How it works

```
every pollIntervalSeconds:
  for each .md file in (dailyNotesFolder ∪ includedFolders):
    if file mtime > last evaluated time:
      build one prompt with:
        - all policies from policies.md
        - (if file is a daily note) yesterday's daily content
        - the current note inside a ```markdown fence
      send to `claude -p` via stdin
      extract the rewritten note from the response fence
      if it differs from current content, write it back
      record the new mtime so the next sweep skips this file
```

The plugin owns no rules. Every behaviour — TODO discipline,
deliverable enforcement, daily rollover, formatting cleanup — is
expressed as prose in `policies.md`. Want to add a new rule? Add a
new `# Policy: <id>` section. Want to disable one? Delete the
section.

## Setup

1. Install [mise](https://mise.jdx.dev/) and provision the toolchain:
   ```
   mise install
   ```
2. Install dependencies and build the bundle:
   ```
   bun install
   bun run build
   ```
3. Copy `manifest.json` and `main.js` into
   `<your-vault>/.obsidian/plugins/policy-enforcer/`.
4. Enable the plugin in Obsidian's community-plugins settings.
5. Make sure the `claude` CLI is installed and on your PATH (or set
   an absolute path / `wsl claude` in the plugin settings).
6. Copy `policies.example.md` to `<your-vault>/policies.md` and
   edit to taste.
7. In plugin settings, set **Daily notes folder** (e.g. `daily`)
   and any **Included folders**.

## Development

- `bun test` — run the unit-test suite (policy loader, engine).
- `bun run dev` — esbuild in watch mode.
- `bun run build` — typecheck and produce `main.js`.

Obsidian-aware code lives in `src/main.ts` and `src/settings.ts`
only. The engine, policy loader, and Claude client are pure
modules so policies and prompt-building can be tested without the
Obsidian runtime.

## Commands

- **Enforce active note now** — run the policies on the active
  note immediately, bypassing the poll interval.
- **Run polling sweep now** — process every in-scope note whose
  mtime has advanced since the last sweep.
- **Reload policies file** — re-read `policies.md` (also happens
  automatically when you edit and save the file).

## Settings

- **Claude binary** — command used to launch the `claude` CLI. The
  field is whitespace-split: the first token is the binary, the
  rest are leading args before `-p`. Examples:
  - `claude` (default, resolved on PATH)
  - `/usr/local/bin/claude` (absolute path)
  - `wsl claude` — run claude inside WSL from Windows Obsidian
  - `wsl.exe -e claude` — same, but explicit
- **Policies file** — path within the vault. Default `policies.md`.
- **Poll interval (seconds)** — how often the sweep runs. Default
  `60`, minimum `15`. Files whose mtime has not advanced since the
  last sweep are skipped, so most ticks are cheap.
- **Claude timeout (ms)** — abort a single invocation after this
  long. Default `120000`.
- **Daily notes folder** — folder containing `YYYY-MM-DD.md` files.
  Files in this folder get the previous daily's content injected
  into the policy prompt as context.
- **Included folders** — comma-separated additional folders to
  monitor. Leave empty to enforce only on daily notes.
- **Debug logging** — log every prompt and response to the
  devtools console (`Ctrl+Shift+I`).

## Caveats

- Desktop only. The plugin shells out to a subprocess, which is
  not available on Obsidian mobile.
- Every poll consumes Claude credits / Max subscription usage.
  Use `pollIntervalSeconds`, `includedFolders`, and unsubscribing
  unneeded policies to keep usage in check.
- Claude rewrites the entire note. Trust depends on your policies
  being clear; vague prose ("make this better") will produce
  unpredictable rewrites. Always commit your vault to git so you
  can recover unintended changes.
