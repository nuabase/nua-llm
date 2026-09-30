---
"nuabase": minor
---

Casts and agents now make use of provider prompt caching. Claude on OpenRouter caches the prompt, instructions and schema of a cast, so repeat calls of the same cast read them at about a tenth of the price, and agent turns read the conversation the previous turn sent. Casts through OpenRouter stay on one upstream provider, so models that cache automatically (DeepSeek, GLM, Kimi, GPT) reuse it too.
