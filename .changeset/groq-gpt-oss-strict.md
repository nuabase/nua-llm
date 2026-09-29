---
"nuabase": patch
---

The "fast" model alias now uses `openai/gpt-oss-120b` on Groq instead of the preview `qwen/qwen3.8-27b`. On Groq models that support strict structured outputs, casts now enforce the output schema natively instead of describing it in the prompt.
