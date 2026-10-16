import fs from 'node:fs';
import crypto from 'node:crypto';
export function createStore(file) {
  let db = { conversations: [], messages: [], events: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => { const dir = file.split('/').slice(0,-1).join('/') || '.'; fs.mkdirSync(dir, {recursive:true}); const t=file+'.tmp'; fs.writeFileSync(t, JSON.stringify(db,null,2)); fs.renameSync(t,file); };
  return {
    createConversation(title){ const c={id:crypto.randomUUID(),title:title||'New chat',createdAt:Date.now(),cwd:null}; db.conversations.push(c); db.events[c.id]=[]; save(); return c; },
    listConversations(){ return db.conversations; },
    getConversation(id){ return db.conversations.find(c=>c.id===id); },
    addMessage(convId, role, text){ const m={id:crypto.randomUUID(),convId,role,text,at:Date.now()}; db.messages.push(m); save(); return m; },
    getMessages(convId){ return db.messages.filter(m=>m.convId===convId); },
    appendEvent(convId, evt){ const e={id:(db.events[convId]||[]).length, at:Date.now(), ...evt}; (db.events[convId]=db.events[convId]||[]).push(e); save(); return e; },
    getEvents(convId, after=0){ return (db.events[convId]||[]).filter(e=>e.id>=after); }
  };
}
