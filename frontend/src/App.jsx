import { useEffect, useState } from 'react';
import { API, listConv, createConv, sendMsg, subscribe } from './api.js';

export default function App(){
  const [convs,setConvs]=useState([]); const [activeId,setActiveId]=useState(null);
  const [detail,setDetail]=useState({messages:[],events:[]}); const [input,setInput]=useState('');
  const [streaming,setStreaming]=useState(false); const [error,setError]=useState('');
  const loadConvs=async()=>{ try{ setConvs(await listConv()); }catch(e){ setError('server offline'); } };
  useEffect(()=>{ loadConvs(); },[]);
  useEffect(()=>{
    if(!activeId) return;
    fetch(`${API}/api/conversations/${activeId}`).then(r=>r.json()).then(setDetail).catch(()=>setError('load failed'));
    let retry=0; let close=null;
    const connect=()=>{ try{ close=subscribe(activeId,(e)=>{ setDetail(d=>({...d,events:[...(d.events||[]),e]})); if(e.type==='result') setStreaming(false); }); }catch{ setTimeout(connect,2000); } };
    connect();
    return ()=>close&&close();
  },[activeId]);
  const send=async(approved)=>{
    if(!input.trim()&&!approved) return;
    setError(''); setStreaming(true);
    try{
      let id=activeId;
      if(!id){ const c=await createConv(input.slice(0,40)); id=c.id; setActiveId(id); await loadConvs(); }
      const r=await sendMsg(id,input,approved);
      setInput('');
      if(r.approval_required) setStreaming(false);
    }catch{ setError('send failed'); setStreaming(false); }
  };
  const cancel=async()=>{ await fetch(`${API}/api/conversations/${activeId}/cancel`,{method:'POST'}); setStreaming(false); };
  const runJob=async()=>{ const r=await fetch(`${API}/api/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:input||'build + test',sessionId:activeId})}).then(r=>r.json()); setDetail(d=>({...d,events:[...(d.events||[]),{type:'log',text:'job: '+JSON.stringify(r)}]})); };
  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-black/40 p-3 space-y-2">
        <button className="w-full bg-white/10 rounded p-2" onClick={async()=>{const c=await createConv('New chat'); setActiveId(c.id); loadConvs();}}>＋ New chat</button>
        {(convs||[]).map(c=><button key={c.id} onClick={()=>setActiveId(c.id)} className={`block w-full text-left p-2 rounded ${c.id===activeId?'bg-white/20':'hover:bg-white/10'}`}>{c.title||c.id.slice(0,8)}</button>)}
      </aside>
      <main className="flex-1 flex flex-col p-4">
        {!activeId ? <div className="m-auto opacity-60">Ask the free agent something — runs local `opencode` binary, GitHub for jobs.</div> : <>
          <div className="flex-1 overflow-auto space-y-2">
            {(detail.messages||[]).map(m=><div key={m.id} className={`p-2 rounded ${m.role==='user'?'bg-blue-900/40':'bg-white/5'}`}><b>{m.role}:</b> {m.text}</div>)}
            <div className="text-xs opacity-80 space-y-1 border-t pt-2">
              {(detail.events||[]).map((e,i)=><div key={i} className={e.type==='tool_call'?'text-yellow-300':e.type==='error'?'text-red-400':'text-gray-300'}>[{e.type}] {e.text||e.tool}</div>)}
              {streaming && <div className="animate-pulse">● streaming free opencode…</div>}
            </div>
            {(detail.events||[]).some(e=>e.type==='approval_required') && <button className="bg-yellow-600 rounded p-2" onClick={()=>send(true)}>Approve consequential action</button>}
          </div>
          {error && <div className="text-red-400">{error} <button onClick={()=>setError('')}>dismiss</button></div>}
          <div className="flex gap-2 mt-3">
            <input className="flex-1 text-black rounded p-2" value={input} onChange={e=>setInput(e.target.value)} placeholder="Type a task…" onKeyDown={e=>e.key==='Enter'&&send(false)} />
            <button className="bg-green-600 rounded px-4" onClick={()=>send(false)}>Send</button>
            {streaming && <button className="bg-red-600 rounded px-4" onClick={cancel}>Cancel</button>}
            <button className="bg-white/10 rounded px-4" onClick={runJob}>Run GitHub job</button>
          </div>
        </>}
      </main>
    </div>
  );
}
