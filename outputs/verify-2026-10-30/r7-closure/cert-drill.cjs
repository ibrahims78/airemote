const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const ROOT='D:/autoclaw projects-new/AiRemote';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'airemote-cert-'));
const dbPath=path.join(tmp,'data','airemote.db');
fs.mkdirSync(path.dirname(dbPath),{recursive:true});
const certFile=path.join(tmp,'data','tls','server.crt');
const fp=()=>{const x=new crypto.X509Certificate(fs.readFileSync(certFile));return {sha:x.fingerprint256.slice(0,23),to:x.validTo}};
const srv=require(ROOT+'/packages/server-desktop/server.js');
(async()=>{
  await srv.start({port:3990,jwtSecret:crypto.randomBytes(32).toString('hex'),dbPath,tls:true,backup:false,retention:false,logger:{info(){},warn(){},error(){}},desktopCallbacks:{}});
  const a=fp(); console.log('first boot generated cert:',JSON.stringify(a));
  await srv.stop();
  fs.rmSync(path.join(tmp,'data','tls'),{recursive:true,force:true});
  console.log('tls directory deleted (the runbook action for an expired or replaced certificate)');
  await srv.start({port:3990,jwtSecret:crypto.randomBytes(32).toString('hex'),dbPath,tls:true,backup:false,retention:false,logger:{info(){},warn(){},error(){}},desktopCallbacks:{}});
  const b=fp(); console.log('second boot generated cert:',JSON.stringify(b));
  console.log('rotated:', a.sha!==b.sha);
  try{
    const out=execFileSync('curl.exe',['-s','-o','NUL','--max-time','5','https://127.0.0.1:3990/health'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
    console.log('curl WITHOUT -k unexpectedly succeeded:',out);
  }catch(e){ console.log('curl WITHOUT -k fails as expected:', String(e.stderr||e.message).split('\n').filter(Boolean).slice(-2).join(' ')) }
  await srv.stop();
  process.exit(0);
})().catch(e=>{console.error('FAILED',e.message);process.exit(1)});
