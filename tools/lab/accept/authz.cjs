// Acceptance cases 5-8 measured against the LIVE database (not a temp one).
// Creates two throwaway users, runs the checks, deletes them and verifies deletion.
const fs = require('fs');
const base = 'https://127.0.0.1:3001';
const cred = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json';
const PW = 'P0-temp-check-2026';           // throwaway, deleted at the end
const VIEWER = 'p0-viewer-tmp@local';
const MANAGER = 'p0-manager-tmp@local';

async function json(pathname, opts = {}) {
  const r = await fetch(base + pathname, opts);
  let b = null;
  try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}

(async () => {
  const c = JSON.parse(fs.readFileSync(cred, 'utf8'));
  const lr = await json('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: c.email, password: c.password }) });
  const admin = lr.body.accessToken;
  const A = { authorization: 'Bearer ' + admin, 'content-type': 'application/json' };

  let fail = 0;
  const check = (d, ok, extra) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + d + (ok ? '' : '  (' + extra + ')')); if (!ok) fail++; };
  const ids = [];

  for (const [email, role] of [[VIEWER, 'viewer'], [MANAGER, 'manager']]) {
    const r = await json('/api/users', { method: 'POST', headers: A, body: JSON.stringify({ email, name: 'P0 temp ' + role, password: PW, role }) });
    if (r.status !== 201 && r.status !== 200) { console.log('SETUP FAIL creating ' + role + ': ' + r.status + ' ' + JSON.stringify(r.body)); process.exit(2); }
    const id = (r.body && (r.body.id || (r.body.user && r.body.user.id))) || null;
    ids.push(id);
    console.log('created ' + role + ' id=' + id);
  }

  const login = async (email) => (await json('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) })).body.accessToken;
  const vt = await login(VIEWER);
  const mt = await login(MANAGER);
  check('temp users can log in', !!vt && !!mt, 'no token');

  const V = { authorization: 'Bearer ' + vt, 'content-type': 'application/json' };
  const M = { authorization: 'Bearer ' + mt, 'content-type': 'application/json' };

  // 5 — viewer cannot open SFTP
  const c5 = await json('/api/sftp/connect', { method: 'POST', headers: V, body: JSON.stringify({ host: '127.0.0.1', username: 'u', password: 'p' }) });
  check('5. viewer SFTP connect → 403 role_too_low', c5.status === 403 && c5.body && c5.body.code === 'role_too_low', 'status=' + c5.status + ' ' + JSON.stringify(c5.body));

  // 6 — manager passes the role gate but owns no host, so containment refuses
  const c6 = await json('/api/sftp/connect', { method: 'POST', headers: M, body: JSON.stringify({ host: '203.0.113.7', username: 'u', password: 'p' }) });
  check('6/7. manager with an unowned host → 403 host_not_allowed', c6.status === 403 && c6.body && c6.body.code === 'host_not_allowed', 'status=' + c6.status + ' ' + JSON.stringify(c6.body));

  // 8 — credentials: viewer refused, manager allowed
  const c8a = await json('/api/credentials', { headers: V });
  check('8a. viewer cannot list credentials', c8a.status === 403, 'status=' + c8a.status);
  const c8b = await json('/api/credentials', { headers: M });
  check('8b. manager can list credentials', c8b.status === 200, 'status=' + c8b.status);

  // audit trail on the live DB
  for (const action of ['sftp_denied_role', 'sftp_denied_host', 'credentials_list']) {
    const a = await json('/api/audit?action=' + action, { headers: A });
    const n = (a.body && a.body.total) || 0;
    check('audit row exists on the live DB: ' + action + ' (' + n + ')', a.status === 200 && n > 0, 'status=' + a.status);
  }

  // cleanup
  for (const id of ids) if (id) await json('/api/users/' + id, { method: 'DELETE', headers: A });
  const rest = await json('/api/users', { headers: A });
  const list = Array.isArray(rest.body) ? rest.body : (rest.body && rest.body.users) || [];
  const left = list.filter((u) => u.email === VIEWER || u.email === MANAGER);
  check('temp users removed', left.length === 0, 'still present: ' + JSON.stringify(left.map((u) => u.email)));
  check('no temp viewer can log in after deletion', !(await login(VIEWER)), 'still can log in');

  console.log(fail ? '\n' + fail + ' FAILED' : '\nLIVE AUTHZ ACCEPTANCE PASSED');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERR', e.message); process.exit(2); });
