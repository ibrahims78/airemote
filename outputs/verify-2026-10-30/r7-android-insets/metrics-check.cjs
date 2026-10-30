process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const fs=require('fs');
const base='https://127.0.0.1:3001';
const c=JSON.parse(fs.readFileSync('C:/Users/admin/AppData/Roaming/AiRemote/lab-probe.json','utf8'));
(async()=>{
  const l=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:c.email,password:c.password})}).then(r=>r.json());
  if(!l.token){console.log('LOGIN FAILED');process.exit(1)}
  const anon=await fetch(base+'/metrics');
  console.log('anonymous ->',anon.status);
  const r=await fetch(base+'/metrics',{headers:{Authorization:'Bearer '+l.token}});
  const t=await r.text();
  console.log('authenticated ->',r.status,(r.headers.get('content-type')||''));
  const keep=/^(airemote_up|airemote_uptime_seconds|airemote_info|airemote_devices_total|airemote_devices_online|airemote_ws_clients|airemote_screen_sessions|airemote_screen_viewers|airemote_errors_total|airemote_http_request_duration_seconds_count)/;
  for(const line of t.split('\n')) if(keep.test(line)) console.log('  '+line.trim());
  const codes=[...t.matchAll(/airemote_http_requests_total\{[^}]*\}/g)].map(m=>m[0]).slice(0,6);
  console.log('  http series: '+codes.join(' | '));
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
