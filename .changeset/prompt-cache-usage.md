---
"nuabase": minor
---

`usage` now reports `promptCacheReadTokens` and `promptCacheWriteTokens` when the provider does: the prompt tokens it read from or wrote to its prompt cache. They are part of `promptTokens`. Reported for OpenRouter, DeepSeek and Gemini, and for the Claude Code, Codex and Pi local agents.
