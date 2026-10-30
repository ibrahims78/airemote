process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const fs=require('fs');
const base='https://127.0.0.1:3001';
const c=JSON.parse(fs.readFileSync('C:/Users/admin/AppData/Roaming/AiRemote/lab-probe.json','utf8'));
const t0=Date.now(); const at=()=>((Date.now()-t0)/1000).toFixed(1)+'s';
async function health(){ try { const r=await fetch(base+'/health',{signal:AbortSignal.timeout(2500)}); return await r.json(); } catch { return null; } }
(async()=>{
  const l=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:c.email,password:c.password})}).then(r=>r.json());
  const H={'Authorization':'Bearer '+l.token,'Content-Type':'application/json'};
  const before=await health();
  console.log(at(),'before: version='+(before&&before.version));
  const check=await fetch(base+'/api/desktop/update/check',{method:'POST',headers:H,body:'{}'}).then(r=>r.json());
  console.log(at(),'check:',JSON.stringify({available:check.available,latest:check.latest,verified:check.verified,reason:check.reason}));
  if(!check.available){ console.log('NO UPDATE AVAILABLE - abort'); process.exit(2) }
  let res=null;
  try {
    res=await fetch(base+'/api/desktop/update/apply',{method:'POST',headers:H,body:JSON.stringify({version:check.latest,confirm:true})}).then(r=>r.json());
    console.log(at(),'apply accepted:',JSON.stringify({ok:res.ok,to:res.to,rollback:res.rollback&&res.rollback.split('\\').pop()}));
  } catch(e){ console.log(at(),'apply response lost (server killed):',e.message) }
  let last=null, seen=[];
  for(let i=0;i<120;i++){
    await new Promise(r=>setTimeout(r,2000));
    const h=await health();
    if(h&&h.version!==last){ last=h.version; seen.push(at()+' -> '+h.version); console.log(at(),'health: '+h.version) }
    if(last==='3.8.33') break;
  }
  console.log(at(),'timeline:',seen.join(' | '));
  const rp='C:/Users/admin/AppData/Roaming/AiRemote-Server/updates/result.json';
  console.log('result.json:', fs.existsSync(rp)?fs.readFileSync(rp,'utf8').replace(/\s+/g,' '):'(missing)');
  process.exit(last==='3.8.33'?0:1);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
