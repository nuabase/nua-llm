---
"nuabase": minor
---

`nua.get()` and `nua.list()` take `signal`, an `AbortSignal` that cancels the call. A local agent's process is stopped, SIGINT then SIGKILL 2 seconds later, and the call returns once the process has exited. A call still waiting for a free agent process leaves the queue without starting one. A provider request is aborted. A cancelled call is not retried and fails with `cancelled: true`, a new field of every failed result.

A local agent stopped by `timeoutMs` or `idleTimeoutMs` now also says how much it had printed and, for `timeoutMs`, how long before the stop it last printed, which tells a slow agent from a stuck one.
