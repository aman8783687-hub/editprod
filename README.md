# Free-OpenCode GitHub-Native Agent MVP

ChatGPT-style UI where Node spawns the **free** `opencode` binary. No Atlas, no Vercel required.

## Setup
1. Install free opencode: `npm i -g opencode-ai` (or `curl -fsSL https://opencode.ai/install | bash`, or `docker run ghcr.io/anomalyco/opencode`). Verify: `opencode --version`.
2. `cp .env.example .env` — defaults run in mock if binary missing (`OPENCODE_MOCK=auto`).
3. GitHub (optional for real jobs): token scopes `actions:write contents:read`, set `GITHUB_TOKEN`, `GITHUB_REPO=owner/repo`.
4. `npm --prefix server install && npm --prefix frontend install`
5. `npm --prefix server test` → 5 pass
6. Dev: `npm run dev` (server :3001, UI :5173). Prod: `npm --prefix frontend run build`, `npm --prefix server start` serves UI.

## Env
`PORT WORKSPACE_DIR DATA_FILE OPENCODE_BIN OPENCODE_MOCK GITHUB_TOKEN GITHUB_REPO GITHUB_WORKFLOW API_KEY MODEL VITE_API_URL` — see `.env.example`.

## API
- `GET /api/health`
- `POST /api/conversations {title}` → `{id,...}`
- `GET /api/conversations`, `GET /api/conversations/:id` (messages+events)
- `POST /api/conversations/:id/messages {text,approved?}` → `{started:true}` or `{approval_required:true}`; streams via store+SSE
- `GET /api/conversations/:id/events` SSE with `?after=` replay
- `POST /api/conversations/:id/cancel`
- `POST /api/jobs {prompt,sessionId}` → mock or `workflow_dispatch` to `agent-job.yml`
- `GET /api/jobs/:id`

## E2E flow
Submit task → watch thinking/tool_call/log/result in activity → follow-up in same session (same `WORKSPACE_DIR/<id>`) → Run GitHub job → result appears as log → refresh replays events.

## Limits (no creds)
- No `opencode` binary → mock agent streams fake tool calls (set `OPENCODE_MOCK=1` to force).
- No `GITHUB_TOKEN` → mock job, no real Actions run.
- Browser tools are stubs (log events). Real Playwright later.
- History in `./data/db.json`, workspaces in `./workspaces/`. To migrate to Atlas later, swap `store.js`.

## Deploy
- Local MVP: single Express serves `frontend/dist`.
- Later: `frontend/dist` → GitHub Pages, server → persistent host, `agent-job.yml` runs on free runners.
