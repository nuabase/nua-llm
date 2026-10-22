---
"nuabase": minor
---

`LocalAgent.with({ model, effort, timeoutMs })` gives the same agent with other call options, sharing its executable, environment, logger and `concurrency` limit. One `localAgent()` per CLI can now serve casts on several of its models, such as Codex models that have no alias, without each getting its own limit on processes running at once.
