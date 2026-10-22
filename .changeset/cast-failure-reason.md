---
"nuabase": minor
---

A failed cast now says why on its own: `reason` is the last attempt's failure in the engine's own words (a coding agent's or provider's message, fit to show a user), and `attempts` is how many were made (0 when the request was refused before any). `error` stays the one-line summary for logs. Coding-agent failures no longer prefix the agent's name (`claude: `) to its message, and Codex's API errors are reported by their message instead of as JSON.
