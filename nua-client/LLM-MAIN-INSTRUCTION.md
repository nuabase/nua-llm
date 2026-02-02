# Instructions

* All tests must be integration tests - do not stub or mock actual API calls.
* See [TESTING.md](TESTING.md) for running tests.
* This package must work in both browser and node.js. In browser, it works using the `fetchToken` auth flow. So avoid any  `node:` imports which would crash in browsers. Use web-standard globals instead.
