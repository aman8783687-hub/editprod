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
