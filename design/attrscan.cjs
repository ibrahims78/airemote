const fs=require('fs');
for(const f of ['server.html','windows-agent.html','android.html']){
  const t=fs.readFileSync('C:/Users/admin/AppData/Roaming/AutoClaw-oversea-official/accounts/ba207bd929e7ad7367272dfba67222768ae625cdd8b716878bf860274d23e71a/projects/Default/design/'+f,'utf8');
  const bad=[...t.matchAll(/(placeholder|title|value)="<span/g)];
  console.log(f+': span-in-attribute='+bad.length);
  for(const m of bad){ const i=t.indexOf(m[0]); console.log('   ...'+t.slice(Math.max(0,i-60),i+120).replace(/\s+/g,' ')); }
}
