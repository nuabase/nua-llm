---
"nuabase": patch
---

Schemas with `$ref`s, such as those using `.meta({ id })` or recursive schemas, now work with native schema enforcement. The schema sent to the engine had refs that pointed nowhere, so engines either rejected it or did not enforce it.
