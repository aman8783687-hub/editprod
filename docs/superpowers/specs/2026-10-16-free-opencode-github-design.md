# Free-OpenCode + GitHub-Native Agent Platform — Design
Date: 2026-10-16
Status: provisional-approved (user said "Yes exactly that" + "continue")

## 1. Goal
ChatGPT-like web app where the agent engine is **only** the free open-source `opencode` install (npm `opencode-ai` / curl script / docker `ghcr.io/anomalyco/opencode`), workspaces are **GitHub repos**, finite jobs run on **GitHub Actions free runners**, no paid services (no Atlas, no Vercel required for MVP).

## 2. Architecture
```
[React Vite UI] <--REST+SSE--> [Node Express control plane] --spawn--> [free `opencode` binary]
        |                                |--octokit--> [GitHub repos + Actions]
        |                                |--fs (allowlist)--> [WORKSPACE_DIR = git clone]
        |--served by same Express in MVP (later GitHub Pages)
`./data/*.json` = conversations, messages, tasks, events (replaces MongoDB).
GitHub = source of truth for code; JSON = source of truth for chat history.
```

Monorepo: `frontend/`, `server/`, `.github/workflows/agent-job.yml`, `data/` (gitignored), `.env.example`.

## 3. Components
- **frontend**: Vite+React+Tailwind. Sidebar conversations, main stream, activity/tool-call log, prompt input, job panel, approval button, cancel, reconnect, empty/loading/error states. `VITE_API_URL` only env.
- **server/src/index.js**: Express, serves `frontend/dist` statically + `/api/*`. Request id + audit log.
- **server/src/store.js**: file JSON store (`data/db.json` with {conversations,messages,tasks,events}). Atomic write via tmp+rename. No Mongo dependency. Migration path to Atlas later documented.
- **server/src/opencode.js**: adapter over free binary.
  - Detect: `opencode --version` or `npx -y opencode-ai --version`.
  - `createSession(cwd)` = `git clone` or `mkdir WORKSPACE_DIR/<convId>` + `opencode run --help` probe.
  - `prompt(sessionId, text)` = `spawn('opencode', ['run', text, '--format','json'], {cwd, timeout:120000, env: cleaned})`, parse stdout chunks into events `{type: thinking|tool_call|log|result|error}`.
  - If binary missing → `mock` mode streams fake events so E2E still works. `OPENCODE_MOCK=1` forces mock.
  - Cancel = `child.kill(SIGTERM)`.
  - Env passthrough blocklist: never pass `GH_TOKEN`, `OPENAI_*`, `ANTHROPIC_*` into agent spawn; only `MODEL` allowlist + `WORKSPACE_DIR`.
- **server/src/github.js**: octokit `workflow_dispatch` to `agent-job.yml` if `GITHUB_TOKEN+REPO` set, else mock job with fake logs. Poll `actions/runs`. Return logs to agent as message.
- **server/src/computer.js**: allowlist cmds `ls,cat,echo,pwd,node,npm,git,opencode`, cwd jailed to `WORKSPACE_DIR`, 15s timeout, no `..` escape. Browser tools MVP stub: `navigate/click/fill/screenshot` emit log events (real Playwright later).
- **server/src/sse.js**: `GET /api/conversations/:id/events` with `Last-Event-ID`, replay from store on reconnect.
- **Auth/audit/isolation**: stub `x-api-key` check if `API_KEY` set, per-conversation `cwd` isolation, 15s cmd timeout + 120s agent timeout, `approval_required` for publish/delete/purchase patterns, `audit.log` append.

## 4. Data flow (E2E)
1. `POST /api/conversations` → clone/init workspace → `opencode` session dir.
2. `POST /api/conversations/:id/messages` → spawn `opencode run` → stream events → persist → SSE.
3. Follow-up → same `cwd` + history file → new `opencode run`.
4. `POST /api/jobs` → `workflow_dispatch` (or mock) → poll → `GET /api/jobs/:id/logs` → post result as agent message.
5. Refresh → `GET /api/conversations/:id` + replay events → no loss.

## 5. Error handling / testing
Loading shimmer, toasts, cancel, SSE backoff reconnect, empty states. `server/npm test` (node:test, store+sandbox+mock opencode), `frontend` build check, `scripts/e2e.sh` curls REST+SSE.

## 6. Env (.env.example)
`PORT, WORKSPACE_DIR=./workspaces, DATA_FILE=./data/db.json, OPENCODE_BIN=opencode, OPENCODE_MOCK=auto, GITHUB_TOKEN=, GITHUB_REPO=owner/repo, GITHUB_WORKFLOW=agent-job.yml, API_KEY=, MODEL=`.

## 7. Self-review
- No TBD: all adapters have mock fallback, paths concrete.
- Consistent: no Atlas/Vercel dependency; GitHub only for code+jobs, not chat history.
- Scope: single MVP plan, no microservices.
- Unambiguous: free binary = `opencode-ai` npm / install script / docker; jobs = `agent-job.yml` dispatch.

User review: please flag changes before plan.
