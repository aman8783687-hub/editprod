export const API = import.meta.env.VITE_API_URL || '';
export const listConv = () => fetch(`${API}/api/conversations`).then(r=>r.json());
export const createConv = (title) => fetch(`${API}/api/conversations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}).then(r=>r.json());
export const sendMsg = (id,text,approved) => fetch(`${API}/api/conversations/${id}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,approved})}).then(r=>r.json());
export function subscribe(id, onEvt){ const es=new EventSource(`${API}/api/conversations/${id}/events`); es.onmessage=e=>onEvt(JSON.parse(e.data)); return ()=>es.close(); }
