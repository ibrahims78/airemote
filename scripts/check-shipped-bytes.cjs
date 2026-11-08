'use strict';
/**
 * check-shipped-bytes.cjs — تقرير فقط (ليس بوابة).
 * يفحص البايتات المشحونة فعلًا: app.asar المثبَّت للسيرفر، وapp.asar المبني للوكيل.
 * الغرض: إثبات أن إصلاحًا في الشجرة وصل إلى ما تشغّله الآلة، لا أن البناء «يبدو» ناجحًا.
 * المسارات مثبَّتة على مختبر هذا الجهاز عن قصد.
 * Usage: node scripts/check-shipped-bytes.cjs
 */
// Verify the shipped artifacts contain this session's fixes by scanning raw bytes.
// asar stores file contents uncompressed, so markers appear as plain text.
const fs = require('fs');

const SERVER_ASAR = 'C:/Users/admin/AppData/Local/Programs/AiRemote Server/resources/app.asar';
const AGENT_ASAR = 'D:/autoclaw projects-new/AiRemote/releases/agent-windows/win-unpacked/resources/app.asar';

let fail = 0;
const check = (d, ok, extra) => { console.log((ok ? 'PASS: ' : 'FAIL: ') + d + (ok ? '' : '  (' + extra + ')')); if (!ok) fail++; };

function scan(file, needles) {
  const buf = fs.readFileSync(file);
  return needles.map((n) => [n, buf.includes(Buffer.from(n, 'utf8'))]);
}

if (!fs.existsSync(SERVER_ASAR)) { console.log('FAIL: installed server asar missing'); process.exit(1); }
const serverText = fs.readFileSync(SERVER_ASAR).toString('latin1');
const serverVer = (serverText.match(/"version"\s*:\s*"([0-9.]+)"/) || [])[1];
const EXPECTED = fs.readFileSync('D:/autoclaw projects-new/AiRemote/VERSION', 'utf8').trim()
check('installed server asar is ' + EXPECTED, serverVer === EXPECTED, 'found ' + serverVer);

const serverNeedles = [
  'sftp_denied_role',
  'sftp_denied_host',
  'host_not_allowed',
  'credential_create',
  'credentials_list',
  'agent:fs_response',   // bridge still accepts the 3.14.3 name
  'agent:pty_output',
  'platform_not_supported', // 3.16.0 — the startup switch is refused off Windows
  'server:set_startup',
];
for (const [n, ok] of scan(SERVER_ASAR, serverNeedles)) check('server asar contains "' + n + '"', ok, 'missing');

if (fs.existsSync(AGENT_ASAR)) {
  const agentText = fs.readFileSync(AGENT_ASAR).toString('latin1');
  const agentVer = (agentText.match(/"version"\s*:\s*"([0-9.]+)"/) || [])[1];
  check('agent asar is ' + EXPECTED, agentVer === EXPECTED, 'found ' + agentVer);
  for (const [n, ok] of scan(AGENT_ASAR, ['__chatSeen', 'tab-chat-badge'])) check('agent asar contains "' + n + '"', ok, 'missing');
} else {
  console.log('SKIP: built agent asar missing');
}

console.log(fail ? '\n' + fail + ' FAILED' : '\nSHIPPED-BYTES VERIFICATION PASSED');
process.exit(fail ? 1 : 0);
