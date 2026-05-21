# Vault policies

Drop this file at the root of your vault as `policies.md`. Each
`# Policy: <id>` section below is one policy sent to Claude on every
polling sweep. The body is plain prose; edit, add, or remove freely.

The plugin sends Claude every policy plus the current note (and, when
the note is a daily, the previous daily as extra context). Claude
returns the note rewritten so it complies with every policy. Make
your policies clear about both what to flag AND how to fix it,
because Claude is doing both in one shot.

# Policy: deliverable-required

Every TODO marked `[x]` must reference a verifiable deliverable: a
GitHub URL, a file path in the vault or filesystem, a directory, an
image/screenshot, or a clearly-named external artifact (Linear
ticket, Notion doc, etc.).

If a checked TODO has no such reference, revert it to `[ ]` and add
a brief inline note in italics after the text, like
`_(no deliverable linked)_`, so the user knows why it was reverted.
Do NOT touch unchecked TODOs.

# Policy: descriptive-task

Every TODO must be specific enough to act on without further
clarification. If a TODO is fewer than three words, vague ("fix
it", "improve things"), or bundles unrelated outcomes
("refactor and ship and document"), rewrite it as a parent task
with sub-todos that split the work, OR add an italic suggestion
`_(too broad — break down)_` after the line if you cannot infer
the breakdown safely.

# Policy: sub-todos-complete

A TODO marked `[x]` whose nested sub-todos are not all `[x]` is
making a premature completion claim. Revert the parent to `[ ]`
and add `_(sub-todos still open)_` after the text. Apply this to
every checked ancestor of an unchecked leaf, not just the
topmost one.

# Policy: carry-incomplete-from-previous-daily

If a previous daily note is provided in context, ensure that every
TODO from that note which is still `[ ]` (and whose corresponding
line does not already appear in this note) is carried over under
a `## Carried over` section at the bottom. Preserve the nesting
of incomplete sub-todos and drop completed branches. Do NOT carry
items that already exist in today's note (compare by text, not by
line number). If the section already exists, update it in place
rather than duplicating it.
