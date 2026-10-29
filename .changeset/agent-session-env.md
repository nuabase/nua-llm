---
"nuabase": minor
---

`startAgentSession()` takes `env`, the environment `open` runs in on macOS, and `unsetEnv`, names the launcher unsets before starting the agent. A terminal app that `open` launches keeps `open`'s environment for every later window, so before this a server's own settings reached the user's other terminal sessions. It throws a `TypeError` for an `unsetEnv` entry that isn't a shell variable name.
