# nuabase

## 2.3.10

### Patch Changes

- 0303881: The "fast" model alias now uses `openai/gpt-oss-120b` on Groq instead of the preview `qwen/qwen3.8-27b`. On Groq models that support strict structured outputs, casts now enforce the output schema natively instead of describing it in the prompt.

## 2.3.9

### Patch Changes

- Format the release script with Prettier

## 2.3.8

### Patch Changes

- Publish the packed tarball with npm, so 2FA is approved in the browser
  Release nuabase through changesets and the release train
