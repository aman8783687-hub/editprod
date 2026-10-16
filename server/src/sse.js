export function sseHandler(store){
  return (req,res)=>{
    const {id}=req.params;
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
    let after=parseInt(req.headers['last-event-id']||req.query.after||'0',10)||0;
    const timer=setInterval(()=>{
      for(const e of store.getEvents(id,after)){ res.write(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`); after=e.id+1; }
    },400);
    req.on('close',()=>clearInterval(timer));
  };
}
