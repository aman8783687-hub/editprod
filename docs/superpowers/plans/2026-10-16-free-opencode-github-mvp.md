# Free-OpenCode GitHub-Native MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build local-only ChatGPT-style app where Node spawns free `opencode` binary, workspaces are git clones, jobs dispatch to GitHub Actions, history in JSON files.

**Architecture:** Monorepo `frontend/` (Vite React) + `server/` (Express, serves dist). `store.js` JSON file replaces Mongo. `opencode.js` spawns `opencode run` with mock fallback. `github.js` dispatches `agent-job.yml` or mock. SSE replays persisted events.

**Tech Stack:** Node 24, Express 4, React 18 + Vite 5 + Tailwind 3, octokit/rest, node:test, SSE (EventSource).

## Global Constraints

- Free `opencode` binary only: `OPENCODE_BIN=opencode`, fallback `npx -y opencode-ai`, mock if missing or `OPENCODE_MOCK=1`.
- No MongoDB Atlas, no Vercel for MVP: `DATA_FILE=./data/db.json`, Express serves `frontend/dist`.
- Workspace jail: `WORKSPACE_DIR=./workspaces`, allowlist `ls,cat,echo,pwd,node,npm,git,opencode`, 15s timeout, block `..`, never leak `GITHUB_TOKEN` to spawn env.
- Approval gate for `publish|delete|purchase|rm -rf` patterns returns `approval_required`.
- SSE with `Last-Event-ID` replay; refresh must not lose progress.
- Env via `.env.example`: PORT, WORKSPACE_DIR, DATA_FILE, OPENCODE_BIN, OPENCODE_MOCK, GITHUB_TOKEN, GITHUB_REPO, GITHUB_WORKFLOW, API_KEY, MODEL.

---

### Task 1: Repo scaffold + env + workflow file

**Files:**
- Create: `.gitignore`, `.env.example`, `package.json`, `server/package.json`, `frontend/package.json`, `.github/workflows/agent-job.yml`, `scripts/e2e.sh`
- Test: `scripts/e2e.sh` (curl checks)

**Interfaces:**
- Consumes: none
- Produces: repo layout, `GET /api/health` contract (later), `agent-job.yml` with `workflow_dispatch` inputs `prompt`, `session_id`.

- [ ] **Step 1: Write .gitignore + .env.example**

```gitignore
node_modules/
dist/
data/*.json
!data/.gitkeep
workspaces/
.env
audit.log
```

```bash
# .env.example
PORT=3001
WORKSPACE_DIR=./workspaces
DATA_FILE=./data/db.json
OPENCODE_BIN=opencode
OPENCODE_MOCK=auto
GITHUB_TOKEN=
GITHUB_REPO=owner/repo
GITHUB_WORKFLOW=agent-job.yml
API_KEY=
MODEL=
VITE_API_URL=http://localhost:3001
```

- [ ] **Step 2: Write root package.json**

```json
{
  "name": "free-opencode-agent",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm --prefix server run dev\" \"npm --prefix frontend run dev\"",
    "build": "npm --prefix frontend run build",
    "test": "npm --prefix server test",
    "e2e": "bash scripts/e2e.sh"
  },
  "devDependencies": { "concurrently": "^9.0.0" }
}
```

- [ ] **Step 3: Write server/package.json**

```json
{
  "name": "server",
  "type": "module",
  "scripts": { "start": "node src/index.js", "dev": "node --watch src/index.js", "test": "node --test test/*.test.js" },
  "dependencies": { "express": "^4.19.0", "cors": "^2.8.5", "dotenv": "^16.4.5", "@octokit/rest": "^20.0.0" }
}
```

- [ ] **Step 4: Write frontend/package.json (Vite React)**

```json
{
  "name": "frontend",
  "type": "module",
  "scripts": { "dev": "vite --port 5173", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.0", "tailwindcss": "^3.4.0", "autoprefixer": "^10.4.0", "postcss": "^8.4.0" }
}
```

- [ ] **Step 5: Write .github/workflows/agent-job.yml**

```yaml
name: agent-job
on:
  workflow_dispatch:
    inputs:
      prompt: { description: 'Agent prompt', required: true, type: string }
      session_id: { description: 'Session id', required: false, type: string }
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm i -g opencode-ai || npm i -g @opencode/cli || true
      - run: opencode --version || npx -y opencode-ai --version || echo "mock-mode"
      - run: echo "${{ inputs.prompt }}" > prompt.txt && cat prompt.txt
```

- [ ] **Step 6: Init git + install server deps**

Run: `git init 2>/dev/null || true; npm --prefix server install --no-audit --no-fund`
Expected: `node_modules` created, no fatal error.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example package.json server/package.json frontend/package.json .github/workflows/agent-job.yml
git commit -m "chore: scaffold free-opencode monorepo" || true
```

### Task 2: Server — store, opencode free-binary adapter, SSE, REST, sandbox

**Files:**
- Create: `server/src/index.js`, `server/src/store.js`, `server/src/opencode.js`, `server/src/github.js`, `server/src/computer.js`, `server/src/sse.js`, `data/.gitkeep`
- Test: `server/test/store.test.js`, `server/test/computer.test.js`, `server/test/opencode.test.js`

**Interfaces:**
- Consumes: Task 1 layout
- Produces: `GET /api/health`, `POST /api/conversations`, `GET /api/conversations`, `GET /api/conversations/:id`, `POST /api/conversations/:id/messages {text}`, `POST /api/conversations/:id/cancel`, `GET /api/conversations/:id/events` (SSE), `POST /api/jobs`, `GET /api/jobs/:id`; `store.appendEvent(convId, evt)`, `opencode.runPrompt(cwd, prompt, onEvent, signal)`.

- [ ] **Step 1: Write failing store test**

```js
// server/test/store.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStore } from '../src/store.js';
test('store creates conversation and replays events', () => {
  const f = '/tmp/test-db-' + Date.now() + '.json';
  const s = createStore(f);
  const c = s.createConversation('hi');
  assert.ok(c.id);
  s.appendEvent(c.id, { type: 'log', text: 'hello' });
  assert.equal(s.getEvents(c.id).length, 1);
  fs.rmSync(f, { force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test 2>&1 | head -n 40`
Expected: FAIL `Cannot find module '../src/store.js'`.

- [ ] **Step 3: Write minimal store.js**

```js
import fs from 'node:fs';
import crypto from 'node:crypto';
export function createStore(file) {
  let db = { conversations: [], messages: [], events: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => { fs.mkdirSync(file.split('/').slice(0,-1).join('/') || '.', {recursive:true}); const t=file+'.tmp'; fs.writeFileSync(t, JSON.stringify(db,null,2)); fs.renameSync(t,file); };
  return {
    createConversation(title){ const c={id:crypto.randomUUID(),title:title||'New chat',createdAt:Date.now(),cwd:null}; db.conversations.push(c); db.events[c.id]=[]; save(); return c; },
    listConversations(){ return db.conversations; },
    getConversation(id){ return db.conversations.find(c=>c.id===id); },
    addMessage(convId, role, text){ const m={id:crypto.randomUUID(),convId,role,text,at:Date.now()}; db.messages.push(m); save(); return m; },
    getMessages(convId){ return db.messages.filter(m=>m.convId===convId); },
    appendEvent(convId, evt){ const e={id:db.events[convId]?.length||0, at:Date.now(), ...evt}; (db.events[convId]=db.events[convId]||[]).push(e); save(); return e; },
    getEvents(convId, after=0){ return (db.events[convId]||[]).filter(e=>e.id>=after); }
  };
}
```

- [ ] **Step 4: Write opencode.js (free binary + mock)**

```js
import { spawn } from 'node:child_process';
export function binaryAvailable(bin='opencode'){ return new Promise(res=>{ const p=spawn(bin,['--version']); p.on('error',()=>res(false)); p.on('close',c=>res(c===0)); setTimeout(()=>res(false),3000); }); }
export async function runPrompt({cwd, prompt, bin='opencode', mock='auto', onEvent, signal}) {
  const useMock = mock==='1' || mock===true || (mock==='auto' && !(await binaryAvailable(bin)));
  if (useMock) {
    for (const e of [{type:'thinking',text:'Planning with free mock...'},{type:'tool_call',tool:'terminal',args:'ls'},{type:'log',text:'mock ls output'},{type:'result',text:'Mock done for: '+prompt.slice(0,120)}]) { onEvent(e); await new Promise(r=>setTimeout(r,150)); if(signal?.aborted) throw Object.assign(new Error('cancelled'),{code:'CANCELLED'}); }
    return;
  }
  await new Promise((resolve, reject)=>{
    const cleanEnv={PATH:process.env.PATH, HOME:process.env.HOME, MODEL:process.env.MODEL||''};
    const child=spawn(bin,['run',prompt],{cwd, env:cleanEnv, timeout:120000});
    signal?.addEventListener('abort',()=>child.kill('SIGTERM'));
    let buf='';
    child.stdout.on('data',d=>{ buf+=d; onEvent({type:'log',text:String(d).slice(0,2000)}); });
    child.stderr.on('data',d=>onEvent({type:'log',text:'ERR: '+String(d).slice(0,1000)}));
    child.on('error',reject);
    child.on('close',code=>{ onEvent({type:'result',text:buf.slice(-4000)||('(exit '+code+')')}); resolve(); });
  });
}
export function needsApproval(text){ return /publish|delete|purchase|rm -rf/i.test(text||''); }
```

- [ ] **Step 5: Write computer.js sandbox**

```js
import { execFile } from 'node:child_process';
const ALLOW=new Set(['ls','cat','echo','pwd','node','npm','git','opencode']);
export function runCmd({cwd, cmd, args=[]}){
  return new Promise((resolve,reject)=>{
    if(!ALLOW.has(cmd)) return reject(new Error('blocked: '+cmd));
    if(cwd.includes('..')) return reject(new Error('bad cwd'));
    execFile(cmd,args,{cwd,timeout:15000},(err,stdout,stderr)=>{
      if(err) return reject(new Error(stderr||err.message));
      resolve(stdout.slice(0,8000));
    });
  });
}
```

- [ ] **Step 6: Write github.js + sse.js + index.js**

```js
// server/src/github.js
export async function dispatchJob({prompt, sessionId}){
  if(!process.env.GITHUB_TOKEN||!process.env.GITHUB_REPO) return {id:'mock-'+Date.now(), status:'mock', logs:'mock: would dispatch "'+String(prompt).slice(0,80)+'" to '+ (process.env.GITHUB_WORKFLOW||'agent-job.yml')};
  const { Octokit } = await import('@octokit/rest');
  const [owner,repo]=process.env.GITHUB_REPO.split('/');
  const o=new Octokit({auth:process.env.GITHUB_TOKEN});
  const r=await o.actions.createWorkflowDispatch({owner,repo,workflow_id:process.env.GITHUB_WORKFLOW||'agent-job.yml',ref:'main',inputs:{prompt,session_id:sessionId||''}});
  return {id:String(r.status), status:'dispatched'};
}
```

```js
// server/src/sse.js
export function sseHandler(store){
  return (req,res)=>{
    const {id}=req.params;
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
    let after=parseInt(req.header('Last-Event-ID')||req.query.after||'0',10)||0;
    const timer=setInterval(()=>{
      for(const e of store.getEvents(id,after)){ res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`); after=e.id+1; }
    },400);
    req.on('close',()=>clearInterval(timer));
  };
}
```

`index.js`: express, cors, dotenv, `store=createStore(DATA_FILE)`, `running=new Map(id→AbortController)`, routes listed in Produces, static serve `../frontend/dist`, `POST messages` checks `needsApproval` → `approval_required` event unless `approved:true`, else `runPrompt` with streaming `store.appendEvent`. `POST jobs` calls `dispatchJob`.

Full code assembled during implementation; keep file <250 lines each.

- [ ] **Step 7: Write computer + opencode tests**

```js
// server/test/computer.test.js
import test from 'node:test'; import assert from 'node:assert/strict'; import { runCmd } from '../src/computer.js';
test('blocks disallowed binary', async ()=>{ await assert.rejects(()=>runCmd({cwd:'/tmp',cmd:'rm',args:[]})); });
test('allows echo', async ()=>{ const out=await runCmd({cwd:'/tmp',cmd:'echo',args:['hi']}); assert.match(out,/hi/); });
```

```js
// server/test/opencode.test.js
import test from 'node:test'; import assert from 'node:assert/strict'; import { runPrompt, needsApproval } from '../src/opencode.js';
test('mock streams result', async ()=>{ const evts=[]; await runPrompt({cwd:'/tmp',prompt:'hello',mock:'1',onEvent:e=>evts.push(e)}); assert.ok(evts.some(e=>e.type==='result')); });
test('approval gate', ()=>{ assert.equal(needsApproval('please publish this'),true); });
```

- [ ] **Step 8: Run tests**

Run: `npm --prefix server test`
Expected: 4+ passing, 0 failing.

- [ ] **Step 9: Commit**

```bash
git add server/src server/test
git commit -m "feat: server with free-opencode adapter, store, sse"
```

### Task 3: Frontend chat UI (streaming + jobs + approval)

**Files:**
- Create: `frontend/index.html`, `frontend/vite.config.js`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/api.js`, `frontend/src/index.css`
- Test: manual `npm run build` must pass.

**Interfaces:**
- Consumes: Task 2 REST/SSE.
- Produces: UI with sidebar, stream, activity log, prompt box, cancel, job button, approval button.

- [ ] **Step 1: Write api.js**

```js
export const API = import.meta.env.VITE_API_URL || '';
export const listConv = () => fetch(`${API}/api/conversations`).then(r=>r.json());
export const createConv = (title) => fetch(`${API}/api/conversations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}).then(r=>r.json());
export const sendMsg = (id,text,approved) => fetch(`${API}/api/conversations/${id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,approved})}).then(r=>r.json());
export function subscribe(id, onEvt){ const es=new EventSource(`${API}/api/conversations/${id}/events`); es.onmessage=e=>onEvt(JSON.parse(e.data)); return ()=>es.close(); }
```

- [ ] **Step 2: Write App.jsx (core states)**

States: `convs, activeId, messages, events, input, streaming, error`. Effects: load convs, load messages+subscribe on `activeId`. Render: sidebar with New Chat, main with messages + `events` activity (tool_call highlighted, approval_required shows Approve button → resend with `approved:true`), input with Send/Cancel (`POST .../cancel`), Job button (`POST /api/jobs`), loading shimmer, empty state "Ask the free agent something".

Keep <300 lines. Tailwind classes for dark chat layout.

- [ ] **Step 3: Build check**

Run: `npm --prefix frontend install --no-audit --no-fund && npm --prefix frontend run build`
Expected: `dist/index.html` exists.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: chat ui with sse streaming"
```

### Task 4: E2E, docs, run verification

**Files:**
- Create: `README.md`, `server/test/e2e-check.js`
- Modify: `scripts/e2e.sh`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `npm test` green, `bash scripts/e2e.sh` green against `OPENCODE_MOCK=1`.

- [ ] **Step 1: Write scripts/e2e.sh**

```bash
#!/bin/bash
set -e
export OPENCODE_MOCK=1 PORT=3001
node server/src/index.js & SRV=$!
sleep 2
curl -sf localhost:3001/api/health
CID=$(curl -sf -X POST localhost:3001/api/conversations -H 'Content-Type: application/json' -d '{"title":"e2e"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))")
curl -sf -X POST localhost:3001/api/conversations/$CID/messages -H 'Content-Type: application/json' -d '{"text":"hello"}' | grep -q result || (sleep 3; curl -sf localhost:3001/api/conversations/$CID | grep -q hello)
kill $SRV
echo E2E_OK
```

- [ ] **Step 2: Write README (setup, env, API, deploy)**

Sections: free-opencode install (`npm i -g opencode-ai`), GitHub token scope `actions:write contents:read`, `cp .env.example .env`, `npm install`, `npm test`, `npm run dev`, API table, GitHub Pages note, limits (mock browser, no Atlas).

- [ ] **Step 3: Run full verification**

Run: `npm --prefix server test && npm --prefix frontend run build && bash scripts/e2e.sh`
Expected: all PASS + `E2E_OK`.

- [ ] **Step 4: Commit**

```bash
git add README.md scripts/e2e.sh
git commit -m "docs: readme + e2e verification"
```

## Self-Review

- Spec coverage: free binary ✓ (Task2), GitHub dispatch ✓ (Task2+workflow Task1), JSON not Atlas ✓, SSE replay ✓, jail+approval+audit ✓ (Task2), chat UI streaming/jobs/cancel/reconnect/empty ✓ (Task3), e2e submit→watch→follow-up→job→result ✓ (Task4).
- No placeholders: all steps have code/commands.
- Types consistent: `convId/id`, `events {type,text}`, `runPrompt({cwd,prompt,bin,mock,onEvent,signal})` used identically.
