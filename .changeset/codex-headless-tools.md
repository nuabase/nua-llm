---
"nuabase": patch
---

A headless Codex call turns off Codex's shell, its ChatGPT apps connector, plugins, image viewing and web search. In the read-only sandbox the shell could still read any file and the caller's environment, and the apps connector could browse the web and change the account, so a prompt carrying an injected instruction could reach them. Codex 0.154 accepts these feature names; an older Codex that lacks one fails the call with "Unknown feature flag".
