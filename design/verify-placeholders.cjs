const d=require('./cdp-driver.cjs');
const B='C:/Users/admin/AppData/Roaming/AutoClaw-oversea-official/accounts/ba207bd929e7ad7367272dfba67222768ae625cdd8b716878bf860274d23e71a/projects/Default/design';
(async()=>{let fail=0;
for(const [f,sel] of [['server.html','[data-feature="dash-ai-ask"]'],['windows-agent.html','[data-feature="chat-input"]'],['windows-agent.html','[data-feature="ai-input"]']]){
  const {child}=await d.launch();const cdp=await d.attach();
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:'file:///'+B+'/'+f});await new Promise(r=>setTimeout(r,700));
  if(f.startsWith('windows')) await d.evaluate(cdp,"showTab('session')");
  const ar=await d.evaluate(cdp,`document.querySelector('${sel}').getAttribute('placeholder')`);
  await d.evaluate(cdp,`toggleLang()`);
  const en=await d.evaluate(cdp,`document.querySelector('${sel}').getAttribute('placeholder')`);
  const ok=!ar.includes('<')&&!en.includes('<')&&en.length>0&&ar.length>0;
  if(!ok)fail++;
  console.log((ok?'PASS':'FAIL')+'  '+f+' '+sel+'  AR="'+ar+'"  EN="'+en+'"');
}
console.log('RESULT='+(fail?'FAIL':'PASS'));process.exit(fail?1:0)})();

