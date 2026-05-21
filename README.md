# Obsidian Policy Enforcer

An Obsidian plugin that enforces note policies by shelling out to the
[Claude CLI](https://docs.claude.com/en/docs/claude-code/overview)
(`claude -p`). Policies are written in plain markdown in a file at the
vault root; the plugin sends each policy plus the current note to
Claude and applies the resulting violations to the note.

## Status

Early. The first shipped policy set covers TODO discipline:

1. A checked TODO must reference a verifiable deliverable (link, file,
   directory, image — anything Claude can read or infer).
2. Every TODO must be descriptive enough to be a real task. Broad
   TODOs should be broken down.
3. A TODO with sub-TODOs is complete only when every sub-TODO is
   complete with its own deliverable.
4. When a new daily note is created, every incomplete TODO from the
   most recent prior daily note is carried over under `## Carried over`.

Policies 1–3 run on every note save (debounced). Policy 4 runs once
when a new `YYYY-MM-DD.md` file is created.

## How it works

```
note edit
  -> debounce
  -> parse TODOs                                     (pure)
  -> built-in: parent/sub-todo completion rule       (pure)
  -> for each policy in policies.md:
       send prompt to `claude -p`                    (subprocess)
       parse JSON array of {line, reason}            (pure)
  -> revert flagged [x] to [ ] and append
       <!-- policy:<id>: <reason> --> on each line   (pure)
  -> write back to the vault if anything changed
```

When the agent flags a checked TODO, the plugin reverts the checkbox
to `[ ]` and appends an inline HTML comment with the policy id and
reason. The next save re-evaluates with the latest content, so once
you address the issue the comment disappears automatically.

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
   an absolute path in the plugin settings).
6. Create `policies.md` at the vault root (see the example below).

## Development

- `bun test` — run the unit-test suite (parser, policy loader, engine,
  enforcer, rollover).
- `bun run dev` — esbuild in watch mode.
- `bun run build` — typecheck and produce `main.js`.

The codebase deliberately keeps Obsidian-aware code in
`src/main.ts` and `src/settings.ts` only; every other module is a
pure function so policies can be reasoned about and tested without
the Obsidian runtime.

## Example `policies.md`

See `policies.example.md` in this repo.

## Settings

- **Claude binary** — command used to launch the `claude` CLI. The
  field is whitespace-split: the first token is the binary, the rest
  are leading args before `-p`. Examples:
  - `claude` (default, resolved on PATH)
  - `/usr/local/bin/claude` (absolute path)
  - `wsl claude` — run claude inside WSL from Windows Obsidian
  - `wsl.exe -e claude` — same, but explicit
  - If your binary path contains spaces, wrap it in a `.bat`/`.sh`
    shim and point this setting at the shim; the field does not
    parse shell quoting.
- **Policies file** — path within the vault. Defaults to
  `policies.md`.
- **Debounce (ms)** — how long to wait after the last edit before
  evaluating. Default `3000`.
- **Claude timeout (ms)** — abort a single invocation after this
  long. Default `60000`.
- **Run on note modify** — toggle the on-save policy check.
- **Run rollover on daily-note create** — toggle the daily rollover.
- **Exclude folders** — comma-separated folder paths to skip.

## Caveats

- Desktop only. The plugin shells out to a subprocess, which is not
  available on Obsidian mobile.
- Every on-save evaluation consumes Claude API credits via the CLI.
  Use the debounce and folder-exclude settings to keep usage in
  check.
- The LLM occasionally returns line numbers that do not exist; those
  violations are dropped silently.
