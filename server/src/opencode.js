import { spawn } from 'node:child_process';
export function binaryAvailable(bin='opencode'){ return new Promise(res=>{ const p=spawn(bin,['--version']); p.on('error',()=>res(false)); p.on('close',c=>res(c===0)); setTimeout(()=>res(false),3000); }); }
export async function runPrompt({cwd, prompt, bin='opencode', mock='auto', onEvent, signal}) {
  const useMock = mock==='1' || mock===true || (mock==='auto' && !(await binaryAvailable(bin)));
  if (useMock) {
    for (const e of [{type:'thinking',text:'Planning with free mock...'},{type:'tool_call',tool:'terminal',args:'ls'},{type:'log',text:'mock ls output'},{type:'result',text:'Mock done for: '+String(prompt).slice(0,120)}]) { onEvent(e); await new Promise(r=>setTimeout(r,150)); if(signal?.aborted) throw Object.assign(new Error('cancelled'),{code:'CANCELLED'}); }
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
