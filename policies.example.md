# Vault policies

Drop a copy of this file at the root of your vault as `policies.md`.
Each `# Policy: <id>` section below is one policy. The body is sent
verbatim to Claude as the prompt; edit the wording to taste.

# Policy: deliverable-required

A TODO marked `[x]` must reference a verifiable deliverable. The
deliverable can be any of:

- A GitHub URL (PR, commit, issue, file, line, or repo).
- A path to a file inside the vault or on the filesystem.
- A path to a directory.
- A link to an image, screenshot, or attachment.
- A clearly named external artifact (e.g. "Linear ticket FOO-123",
  "Notion doc <title>").

If a checked TODO has none of the above, return it as a violation
with a one-line reason such as "no link or path on the line".

Do NOT flag unchecked TODOs.

# Policy: descriptive-task

A TODO must be specific enough to act on without further
clarification. Flag a TODO if any of the following apply:

- The text is fewer than three words and not a self-evident name
  (e.g. "fix it", "todo", "stuff").
- The text describes a vague intention rather than a concrete
  action (e.g. "improve things", "look into the thing").
- The text bundles multiple unrelated outcomes that should be
  separate todos (e.g. "refactor and ship and document").

When flagging, the reason should suggest how to break it down,
e.g. "split into separate todos for refactor / ship / docs".

# Policy: sub-todos-complete

A TODO marked `[x]` that has sub-todos must have every sub-todo
(and every nested descendant) also marked `[x]`. If any descendant
is still `[ ]`, the parent's completion claim is premature: flag
the parent line with a reason like "sub-todo on line N is still
open".

This rule is purely structural — you can decide it from the
indented outline above without needing to read the note body. If
multiple ancestors of an open leaf are checked, flag each one
independently, because each made a separate completion claim.

# Policy: parent-needs-deliverable

A TODO marked `[x]` that has sub-todos must itself reference a
single overall deliverable (the rolled-up outcome), in addition to
each sub-todo having its own deliverable. Flag a checked parent
with sub-todos that has no parent-level deliverable, with a reason
like "parent task is complete but no overall deliverable linked".
