---
"nuabase": minor
---

`nuabase/local-agent` can now start an interactive coding-agent session in the user's project, for the user to carry on in a terminal: `writeAgentSession()` writes the first message and a shell launcher that starts Claude Code, Codex or Pi on it (in the agent's auto mode with `approval: 'auto'`), and `openInTerminal()` runs the launcher in a new terminal window on macOS. `agentSessionMode()` says which of these the platform allows, and `fitsAgentSession()` whether a prompt fits.
