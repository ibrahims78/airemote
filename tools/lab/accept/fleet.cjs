// قائمة الأسطول من السيرفر المثبَّت: الاسم · الحالة · النسخة · المعرّف.
// بيانات الدخول من ملف المختبر ولا تُطبع.
const fs = require('fs');
const base = process.env.LAB_BASE || 'https://127.0.0.1:3001';
const cred = process.env.LAB_PROBE || 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

(async () => {
  const c = JSON.parse(fs.readFileSync(cred, 'utf8'));
  const lr = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const j = await lr.json();
  const t = j.accessToken || j.token;
  if (!t) { console.log('login failed:', lr.status); process.exit(1); }
  const dr = await fetch(base + '/api/devices', { headers: { authorization: 'Bearer ' + t } });
  const dj = await dr.json();
  const arr = Array.isArray(dj) ? dj : dj.devices || [];
  console.log('devices: ' + arr.length);
  for (const d of arr) {
    const i = d.info || {};
    console.log([d.name, d.isOnline ? 'ONLINE' : 'offline', i.agentVersion || '-', d.id].join(' | '));
  }
})().catch((e) => { console.log('ERR', e.message); process.exit(2); });
