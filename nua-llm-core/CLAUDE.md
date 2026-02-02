# Instructions

* **This package must work in both browser and node.js**. It is also bundled into other packages that must work in both browser and node.js. So do not import `node:` built-in modules (e.g. `node:crypto`, `node:fs`, `node:path`). Use web-standard globals instead (e.g. `crypto.randomUUID()` instead of `import { randomUUID } from "node:crypto"`).
