export async function dispatchJob({prompt, sessionId}){
  if(!process.env.GITHUB_TOKEN||!process.env.GITHUB_REPO || process.env.GITHUB_REPO==='owner/repo') return {id:'mock-'+Date.now(), status:'mock', logs:'mock: would dispatch "'+String(prompt).slice(0,80)+'" to '+(process.env.GITHUB_WORKFLOW||'agent-job.yml')};
  const { Octokit } = await import('@octokit/rest');
  const [owner,repo]=process.env.GITHUB_REPO.split('/');
  const o=new Octokit({auth:process.env.GITHUB_TOKEN});
  const r=await o.actions.createWorkflowDispatch({owner,repo,workflow_id:process.env.GITHUB_WORKFLOW||'agent-job.yml',ref:'main',inputs:{prompt:String(prompt),session_id:sessionId||''}});
  return {id:String(r.status), status:'dispatched'};
}
const jobs=new Map();
export function saveJob(j){ jobs.set(j.id,j); return j; }
export function getJob(id){ return jobs.get(id); }
