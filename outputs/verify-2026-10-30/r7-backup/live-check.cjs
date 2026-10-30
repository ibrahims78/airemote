process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const fs=require('fs');
const base='https://127.0.0.1:3001';
const c=JSON.parse(fs.readFileSync('C:/Users/admin/AppData/Roaming/AiRemote/lab-probe.json','utf8'));
(async()=>{
  const l=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:c.email,password:c.password})}).then(r=>r.json());
  const H={'Authorization':'Bearer '+l.token,'Content-Type':'application/json'};
  const anonymous=await fetch(base+'/api/desktop/backups');
  console.log('anonymous listing ->',anonymous.status);
  const created=await fetch(base+'/api/desktop/backup',{method:'POST',headers:H}).then(r=>r.json());
  console.log('create ->',created.ok?'ok':'FAIL','bytes='+created.bytes,'counts='+JSON.stringify(created.counts));
  console.log('path  ->',created.path);
  const listed=await fetch(base+'/api/desktop/backups',{headers:H}).then(r=>r.json());
  console.log('state -> files='+listed.state.files,'age='+listed.state.ageSeconds+'s','keep='+listed.state.keep,'dir='+listed.state.dir);
  for(const f of listed.files.slice(0,3)) console.log('  file',f.name,f.bytes);
  const m=await fetch(base+'/metrics',{headers:H}).then(r=>r.text());
  for(const line of m.split('\n')) if(line.startsWith('airemote_backup_')) console.log('metric',line);
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
