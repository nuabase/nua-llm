---
"nuabase": minor
---

`nuabase/local-agent` can now start an interactive coding-agent session in the user's project, for the user to carry on in a terminal: `startAgentSession()` writes the first message and a shell launcher that starts Claude Code, Codex or Pi on it (in the agent's auto mode with `approval: 'auto'`), and on macOS opens it in a new terminal window. It answers with what it did: `opened`, `command` (the user runs it in a terminal), `open_failed` (the files are written but the window didn't open, with the error) or `refused` with the reason. `agentSessionMode()` says beforehand which of these the platform allows.
