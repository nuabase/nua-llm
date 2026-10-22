---
"nuabase": minor
---

Results are now parsed with your Zod schema instead of being checked against its JSON Schema with AJV. `data` is Zod's parsed output: `.default()`s are filled in, `.transform()`s run, `.refine()` checks apply (a failing answer is retried), and unknown object keys are dropped. The JSON Schema shown to the model now describes the schema's input side, so schemas with `.transform()` no longer throw. AJV is no longer bundled.
