---
"nuabase": minor
---

Local agents take an `effort` option (`'low' | 'medium' | 'high'`), passed to the CLI's own setting: Claude Code `--effort`, Codex `model_reasoning_effort`, Pi `--thinking`. Left out, the CLI's default applies. Codex casts no longer run at low reasoning effort unless you ask for it with `effort: 'low'`.
