// سرد مجلد على أي جهاز أندرويد في المختبر (الحالة 1 من خطة 3.14.4: <5s).
// usage: node tools/lab/accept/android.cjs [tab16|tecno|emulator|all]
const fs = require('fs');
const base = process.env.LAB_BASE || 'https://127.0.0.1:3001';
const cred = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DEVICES = {
  emulator: { id: '9b5eeaf9-b30d-449c-875e-1e21e56ac041', path: '/sdcard' },
  tab16: { id: '7fc54b40-e7c1-4db6-9f55-78f377c4f4ad', path: '/sdcard' },
  tecno: { id: '07f8ae91-5b64-41d9-97df-ce649772b0d3', path: '/sdcard' },
};

(async () => {
  const which = (process.argv[2] || 'all').toLowerCase();
  const targets = which === 'all' ? Object.keys(DEVICES) : [which];
  for (const t of targets) if (!DEVICES[t]) { console.log('unknown device: ' + t); process.exit(2); }

  const c = JSON.parse(fs.readFileSync(cred, 'utf8'));
  const lr = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const tok = (await lr.json()).accessToken;
  const H = { authorization: 'Bearer ' + tok };

  let fail = 0;
  for (const name of targets) {
    const d = DEVICES[name];
    const t0 = Date.now();
    const r = await fetch(base + '/api/devices/' + d.id + '/fs/list?path=' + encodeURIComponent(d.path), { headers: H });
    const ms = Date.now() - t0;
    const j = await r.json().catch(() => null);
    const n = Array.isArray(j) ? j.length : (j && j.entries ? j.entries.length : -1);
    const ok = r.status === 200 && n > 0 && ms < 5000;
    if (!ok) fail++;
    console.log((ok ? 'PASS ' : 'FAIL ') + name.padEnd(9) + ' status=' + r.status + ' entries=' + n + ' ' + ms + 'ms');
  }
  console.log(fail ? '\n' + fail + ' FAILED' : '\nANDROID LIST ACCEPTANCE PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', e.message); process.exit(2); });
