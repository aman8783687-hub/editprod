import test from 'node:test'; import assert from 'node:assert/strict'; import { runPrompt, needsApproval } from '../src/opencode.js';
test('mock streams result', async ()=>{ const evts=[]; await runPrompt({cwd:'/tmp',prompt:'hello',mock:'1',onEvent:e=>evts.push(e)}); assert.ok(evts.some(e=>e.type==='result')); });
test('approval gate', ()=>{ assert.equal(needsApproval('please publish this'),true); });
