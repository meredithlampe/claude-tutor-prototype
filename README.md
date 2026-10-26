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
| `npm start`         | Runs the server in production (serves `client/dist`; set env vars yourself) |
| `npm run typecheck` | Typechecks client and server          |
| `npm run lint`      | Lints the whole repo with ESLint      |

## Deploy (Render)

`render.yaml` defines one Node web service with a 1 GB persistent disk at `/var/data`. The server serves the built client, keeps its data in `DATA_DIR`, and asks for `SITE_PASSWORD` (any username) on everything except `/api/health`.

1. Push to `main` on GitHub.
2. In the Render dashboard: **New > Blueprint**, connect the repo, and pick `render.yaml`.
3. When asked, enter `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` and `SITE_PASSWORD`. Render only asks for these when the Blueprint is first created; change them later under the service's **Environment** tab.
4. Apply. After the first deploy, open the service URL and sign in with the site password.

On first start the server fills the disk from `server/seed/` (the sample chats, empty Tutor data). Files already on the disk are never overwritten. Between participants, use **Debug menu > Clear all chats**: it puts the sample chats back, archives Tutor sessions to `tutor-sessions-archive.json`, and resets the Tutor intro.
