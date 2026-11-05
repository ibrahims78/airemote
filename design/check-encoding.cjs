const fs=require('fs');
for(const f of ['server.html','windows-agent.html','android.html']){
  const t=fs.readFileSync('design/'+f,'utf8');
  const ar=(t.match(/[\u0600-\u06FF]/g)||[]).length;
  console.log(f+': Arabic='+ar+'  mojibake='+(t.match(/[\u00D8\u00D9][\u0080-\u00BF]/g)||[]).length);
}
