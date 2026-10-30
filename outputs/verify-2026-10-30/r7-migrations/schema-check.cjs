process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('C:/Users/admin/AppData/Roaming/AiRemote/lab-probe.json','utf8'));
(async()=>{
 const l=await fetch('https://127.0.0.1:3001/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:c.email,password:c.password})}).then(r=>r.json());
 const H={'Authorization':'Bearer '+l.token};
 const st=await fetch('https://127.0.0.1:3001/api/desktop/schema',{headers:H}).then(r=>r.json());
 console.log(JSON.stringify(st));
 const anon=await fetch('https://127.0.0.1:3001/api/desktop/schema');
 console.log('anonymous ->',anon.status);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
