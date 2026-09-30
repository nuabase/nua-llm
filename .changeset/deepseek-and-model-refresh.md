---
"nuabase": minor
---

DeepSeek is now a direct provider: pass `providers: { deepseek: { apiKey } }` and name a DeepSeek model such as `deepseek-flash` or `deepseek-v4-pro`. DeepSeek requests run with thinking turned off, and schemas are described in the prompt because DeepSeek has no strict structured outputs. A new `deepseek` alias uses DeepSeek V4 Pro, directly or through OpenRouter.

The model aliases now point at current models: `gemini` → Gemini 3.8 Flash, `qwen` → Qwen3.8 2.4T A95B, `kimi` → Kimi K3, `sonnet` → Claude Sonnet 5.5, `opus` → Claude Opus 5.5, `gpt` → GPT-6.1 Sol, and the OpenRouter fallback for `fast` → GLM-5.3 Flash.
