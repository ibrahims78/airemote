// Acceptance cases 1 + 2 + 11 (fs over the live 3.14.4 server to real agents).
const fs = require('fs');
const cred = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json';
const base = 'https://127.0.0.1:3001';
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3';
const EMU = '9b5eeaf9-b30d-449c-875e-1e21e56ac041';

(async () => {
  const c = JSON.parse(fs.readFileSync(cred, 'utf8'));
  const lr = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const t = (await lr.json()).accessToken;
  const H = { authorization: 'Bearer ' + t };
  let fail = 0;
  const check = (d, ok, extra) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + d + (ok ? '' : '  (' + extra + ')')); if (!ok) fail++; };

  // 1 — list on WIN10
  const t0 = Date.now();
  const l1 = await fetch(base + '/api/devices/' + WIN10 + '/fs/list?path=' + encodeURIComponent('C:\\'), { headers: H });
  const j1 = await l1.json().catch(() => null);
  const n1 = Array.isArray(j1) ? j1.length : (j1 && j1.entries ? j1.entries.length : -1);
  check('1. WIN10 C:\\ listing returns entries (' + n1 + ' in ' + (Date.now() - t0) + 'ms)', l1.status === 200 && n1 > 0, 'status=' + l1.status + ' body=' + JSON.stringify(j1).slice(0, 160));

  // 2 — write then read
  const body = 'p0 acceptance ' + new Date().toISOString();
  const up = await fetch(base + '/api/devices/' + WIN10 + '/fs/upload?path=' + encodeURIComponent('C:\\air3144\\p0-check.txt'), {
    method: 'POST', headers: { ...H, 'content-type': 'application/octet-stream' }, body,
  });
  const upj = await up.json().catch(() => ({}));
  check('2a. upload accepted', up.status === 200 || up.status === 201, 'status=' + up.status + ' ' + JSON.stringify(upj).slice(0, 120));
  await new Promise((r) => setTimeout(r, 700));
  const dl = await fetch(base + '/api/devices/' + WIN10 + '/fs/download?path=' + encodeURIComponent('C:\\air3144\\p0-check.txt'), { headers: H });
  const txt = dl.status === 200 ? await dl.text() : '';
  check('2b. download matches what was written', txt.trim() === body, 'status=' + dl.status + ' got=' + JSON.stringify(txt.slice(0, 80)));

  // 11 — emulator (Android) listing, exercises the same agent->server path
  const l3 = await fetch(base + '/api/devices/' + EMU + '/fs/list?path=' + encodeURIComponent('/sdcard'), { headers: H });
  const j3 = await l3.json().catch(() => null);
  const n3 = Array.isArray(j3) ? j3.length : (j3 && j3.entries ? j3.entries.length : -1);
  check('11. emulator /sdcard listing returns entries (' + n3 + ')', l3.status === 200 && n3 > 0, 'status=' + l3.status + ' body=' + JSON.stringify(j3).slice(0, 160));

  console.log(fail ? '\n' + fail + ' FAILED' : '\nFS ACCEPTANCE PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', e.message); process.exit(2); });
