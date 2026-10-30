const ROOT='D:/autoclaw projects-new/AiRemote';
const {createDatabase}=require(ROOT+'/packages/server-desktop/lib/db-adapter');
const db=createDatabase('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db');
const n=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r=>r.name);
const mine=['idx_audit_log_created','idx_audit_log_device','idx_sessions_device_started','idx_sessions_user_started'];
console.log('present:',mine.filter(x=>n.includes(x)).join(','));
console.log('missing:',mine.filter(x=>!n.includes(x)).join(',')||'none');
console.log('legacy idx_sessions_device kept:',n.includes('idx_sessions_device'));
db.close();
