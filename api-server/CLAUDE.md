# Development Guide

## Quick Commands

```bash
npm run dev          # Start dev server (port 3030) with hot-reload
npm run build        # Compile TypeScript
npm run typecheck    # Type-check only
npm run test
```

## Running the Server

`npm run dev` uses hivemind to run 3 processes in parallel:
- TypeScript compiler in watch mode
- Express server with Node --watch (waits 8s for initial build)
- Graphile job queue worker

Server runs at `http://localhost:3030`. Environment loaded from `src/.env` via dotenvx.

## Testing

See [TESTING.md](TESTING.md)
