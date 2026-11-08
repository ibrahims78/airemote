// Acceptance cases 3 + 4: terminal echo over the live server to a real agent.
const fs = require('fs');
const WebSocket = require('D:/autoclaw projects-new/AiRemote/packages/server/node_modules/ws');
const cred = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json';
const base = 'https://127.0.0.1:3001';
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

(async () => {
  const c = JSON.parse(fs.readFileSync(cred, 'utf8'));
  const lr = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  const tok = (await lr.json()).accessToken;
  const tr = await fetch(base + '/api/auth/ws-ticket', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' });
  const tj = await tr.json();
  const ticket = tj.ticket || tj.token;
  if (!ticket) { console.log('FAIL: no ws ticket', JSON.stringify(tj)); process.exit(1); }

  const ws = new WebSocket('wss://127.0.0.1:3001/pty?ticket=' + encodeURIComponent(ticket) + '&deviceId=' + WIN10, { rejectUnauthorized: false });
  let out = '';
  let phase = 0;
  let failed = 0;
  const finish = (msg, ok, extra) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + msg + (ok ? '' : '  (' + extra + ')')); if (!ok) failed++; };
  const sendData = (s) => ws.send(JSON.stringify({ type: 'pty:data', payload: { data: Buffer.from(s, 'utf8').toString('base64') } }));

  const done = () => {
    finish('3. terminal shows the echo of `echo ok`', /ok/.test(out), 'output=' + JSON.stringify(out.slice(-200)));
    ws.close();
    console.log(failed ? '\n' + failed + ' FAILED' : '\nPTY ACCEPTANCE PASSED');
    process.exit(failed ? 1 : 0);
  };

  const timer = setTimeout(() => { finish('3. terminal responded within 25s', false, 'timeout; got=' + JSON.stringify(out.slice(-200))); ws.close(); process.exit(1); }, 25000);

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'pty:connect', payload: { deviceId: WIN10, rows: 30, cols: 100, shell: 'auto' } }));
  });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    const p = m.payload || {};
    if (m.type === 'pty:connected' || m.type === 'pty_ready') {
      if (phase === 0) { phase = 1; setTimeout(() => sendData('echo ok\r'), 400); }
      return;
    }
    if (m.type === 'pty:error' || m.type === 'pty_error') {
      clearTimeout(timer);
      finish('3. terminal connected', false, JSON.stringify(p || m).slice(0, 160));
      ws.close(); process.exit(1);
    }
    if (m.type === 'pty:data' || m.type === 'pty_output') {
      const d = p.data !== undefined ? p.data : m.data;
      if (typeof d === 'string') { try { out += Buffer.from(d, 'base64').toString('utf8'); } catch { out += d; } }
      if (phase === 1 && /ok/.test(out) && !/cd \//.test(out)) {
        // case 4 — cd / then pwd (Windows agent: use C:\ and cd)
        phase = 2;
        setTimeout(() => sendData('cd C:\\\rpwd\r'), 300);
      }
      if (phase === 2 && /C:\\/.test(out)) {
        clearTimeout(timer);
        finish('4. `cd` then `pwd` returns the new directory', /C:\\/.test(out), 'output=' + JSON.stringify(out.slice(-300)));
        setTimeout(done, 200);
      }
    }
  });

  ws.on('error', (e) => { clearTimeout(timer); console.log('FAIL: ws error ' + e.message); process.exit(1); });
})().catch((e) => { console.log('ERR', e.message); process.exit(2); });
