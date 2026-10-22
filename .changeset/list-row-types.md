---
"nuabase": patch
---

`list()` rows are typed by the output's name when it is a literal: with `output: { name: 'account', schema: z.string() }`, each row is `{ id: string | number; account: string }` instead of a row whose every field has the output's type.
