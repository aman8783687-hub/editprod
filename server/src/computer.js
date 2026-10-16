import { execFile } from 'node:child_process';
const ALLOW=new Set(['ls','cat','echo','pwd','node','npm','git','opencode']);
export function runCmd({cwd, cmd, args=[]}){
  return new Promise((resolve,reject)=>{
    if(!ALLOW.has(cmd)) return reject(new Error('blocked: '+cmd));
    if((cwd||'').includes('..')) return reject(new Error('bad cwd'));
    execFile(cmd,args,{cwd,timeout:15000},(err,stdout,stderr)=>{
      if(err) return reject(new Error(stderr||err.message));
      resolve(String(stdout).slice(0,8000));
    });
  });
}
