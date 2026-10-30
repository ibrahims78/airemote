process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('C:/Users/admin/AppData/Roaming/AiRemote/lab-probe.json','utf8'));
(async()=>{
 const l=await fetch('https://127.0.0.1:3001/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:c.email,password:c.password})}).then(r=>r.json());
 const H={'Authorization':'Bearer '+l.token,'Content-Type':'application/json'};
 console.log('anonymous ->',(await fetch('https://127.0.0.1:3001/api/desktop/retention')).status);
 const ret=await fetch('https://127.0.0.1:3001/api/desktop/retention',{headers:H}).then(r=>r.json());
 console.log('policy  ->',JSON.stringify(ret.state.policy));
 console.log('preview ->',JSON.stringify(ret.preview));
 const dry=await fetch('https://127.0.0.1:3001/api/desktop/retention/run',{method:'POST',headers:H,body:JSON.stringify({dryRun:true})}).then(r=>r.json());
 console.log('dryRun  ->',dry.dryRun===true?'ok (nothing deleted)':'UNEXPECTED '+JSON.stringify(dry).slice(0,120));
 const m=await fetch('https://127.0.0.1:3001/metrics',{headers:H}).then(r=>r.text());
 for(const line of m.split('\n')) if(/^airemote_(recordings|retention)_/.test(line)) console.log('metric',line);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
