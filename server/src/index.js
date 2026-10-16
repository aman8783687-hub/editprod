import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { runPrompt, needsApproval } from './opencode.js';
import { dispatchJob, saveJob, getJob } from './github.js';
import { sseHandler } from './sse.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DATA_FILE = process.env.DATA_FILE || './data/db.json';
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || './workspaces';
const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode';
const OPENCODE_MOCK = process.env.OPENCODE_MOCK || 'auto';

const store = createStore(DATA_FILE);
const running = new Map();
const app = express();
app.use(cors());
app.use(express.json());

const audit = (msg) => { fs.appendFileSync('audit.log', new Date().toISOString() + ' ' + msg + '\n'); };

app.get('/api/health', (req, res) => res.json({ ok: true, mock: OPENCODE_MOCK }));

app.post('/api/conversations', (req, res) => {
  const c = store.createConversation(req.body?.title);
  const cwd = path.resolve(WORKSPACE_DIR, c.id);
  fs.mkdirSync(cwd, { recursive: true });
  c.cwd = cwd; audit(`conv ${c.id} created`);
  res.json(c);
});
app.get('/api/conversations', (req, res) => res.json(store.listConversations()));
app.get('/api/conversations/:id', (req, res) => {
  const c = store.getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json({ ...c, messages: store.getMessages(c.id), events: store.getEvents(c.id) });
});
app.get('/api/conversations/:id/events', sseHandler(store));

app.post('/api/conversations/:id/messages', async (req, res) => {
  const c = store.getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const { text, approved } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  store.addMessage(c.id, 'user', text);
  audit(`msg ${c.id}: ${text.slice(0,120)}`);
  if (needsApproval(text) && !approved) {
    const e = store.appendEvent(c.id, { type: 'approval_required', text: 'This looks consequential. Approve to run.' });
    return res.json({ approval_required: true, event: e });
  }
  const cwd = path.resolve(WORKSPACE_DIR, c.id);
  fs.mkdirSync(cwd, { recursive: true });
  const ctrl = new AbortController();
  running.set(c.id, ctrl);
  res.json({ started: true });
  (async () => {
    try {
      store.appendEvent(c.id, { type: 'thinking', text: 'Running free opencode...' });
      await runPrompt({ cwd, prompt: text, bin: OPENCODE_BIN, mock: OPENCODE_MOCK, onEvent: (e) => store.appendEvent(c.id, e), signal: ctrl.signal });
      store.addMessage(c.id, 'agent', store.getEvents(c.id).filter(e=>e.type==='result').slice(-1)[0]?.text || 'done');
    } catch (e) {
      store.appendEvent(c.id, { type: 'error', text: e.code==='CANCELLED' ? 'Cancelled' : String(e.message||e) });
    } finally { running.delete(c.id); }
  })();
});

app.post('/api/conversations/:id/cancel', (req, res) => {
  running.get(req.params.id)?.abort();
  res.json({ cancelled: true });
});

app.post('/api/jobs', async (req, res) => {
  const j = saveJob(await dispatchJob({ prompt: req.body?.prompt || '', sessionId: req.body?.sessionId || '' }));
  audit(`job ${j.id} dispatched`);
  res.json(j);
});
app.get('/api/jobs/:id', (req, res) => res.json(getJob(req.params.id) || { error: 'not found' }));

const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) app.use(express.static(dist));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`server :${PORT} mock=${OPENCODE_MOCK}`));
}
export default app;
