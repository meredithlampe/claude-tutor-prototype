# Claude Tutor Prototype

A lightweight clone of the Claude web app for prototyping a learning feature. See `PLAN.md` for scope and build order.

## Setup

Requires Node 20.6+ (for `--env-file`).

```sh
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY
npm run dev
```

- Client: http://localhost:5173 (Vite proxies `/api` to the server)
- Server: http://localhost:3001 (`GET /api/health`)

## Scripts

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Runs client and server together       |
| `npm run build`     | Typechecks and builds the client      |
| `npm run typecheck` | Typechecks client and server          |
| `npm run lint`      | Lints the whole repo with ESLint      |
