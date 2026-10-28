---
"nuabase": minor
---

Local agents: `onOutput`, an option of `nua.get()` and `nua.list()`, passes on everything the agent prints while that call runs, unparsed, so an app can show its progress as a log. `idleTimeoutMs` stops an agent that prints nothing for 2 minutes (Claude Code and Pi; Codex has no idle limit, since it is quiet while it reasons), and `timeoutMs` now defaults to 10 minutes instead of 3. A timeout says which limit was hit, after how long, how to raise it, and the end of the agent's stderr. Claude Code now runs with `--output-format stream-json`, so it prints while it works; only its final result line is read.

Also changed:

- `timeoutMs` and `idleTimeoutMs` must be from 1 to 2147483647 ms (or `null` for no idle limit); `localAgent()`, `findLocalAgent()` and `with()` throw a `TypeError` otherwise. Before, a value such as `0`, `NaN` or `Infinity` stopped the agent at once.
- In `agent.with()`, a `timeoutMs` given as `undefined` now resets to the default, as every other option does, instead of keeping the agent's.
- `findLocalAgent()` reports an invalid option only once it has found an agent, not before it looks.
