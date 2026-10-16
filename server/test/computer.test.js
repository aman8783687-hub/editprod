import test from 'node:test'; import assert from 'node:assert/strict'; import { runCmd } from '../src/computer.js';
test('blocks disallowed binary', async ()=>{ await assert.rejects(()=>runCmd({cwd:'/tmp',cmd:'rm',args:[]})); });
test('allows echo', async ()=>{ const out=await runCmd({cwd:'/tmp',cmd:'echo',args:['hi']}); assert.match(out,/hi/); });
