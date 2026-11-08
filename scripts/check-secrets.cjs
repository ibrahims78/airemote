// Secret-leak guard: search the tracked tree and the session's diffs for the actual
// lab secrets, without ever printing them.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = 'D:/autoclaw projects-new/AiRemote';

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function readFile(p) { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } }

const probe = readJson('C:/Users/admin/AppData/Roaming/AiRemote/lab-probe.json') || {};
const credText = readFile('C:/Users/admin/AppData/Roaming/AiRemote/lab-credentials.txt') || '';
const keystorePw = readFile(path.join(ROOT, 'secrets/keystore-password.txt')) || '';

const creds = {};
for (const line of credText.split(/\r?\n/)) {
  const m = line.match(/^([a-z_]+)=(.+)$/);
  if (m) creds[m[1]] = m[2].trim();
}

const secrets = [
  ['lab-probe.password', probe.password],
  ['vm_guest_password', creds.vm_guest_password],
  ['tab16_unattended_password', creds.tab16_usb_unattended_password],
  ['keystore password', keystorePw],
].filter(([, v]) => v && String(v).length >= 6);

// اسم حساب المختبر معرّف لا سرّ: يظهر في وثائق ونتائج سابقة عن قصد، فلا يُفشل الفحص.

console.log('secrets to check:', secrets.map(([n]) => n).join(', '));

// 1) tracked files
const tracked = execSync('git ls-files', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split(/\r?\n/).filter(Boolean);
let hits = 0;
for (const rel of tracked) {
  let buf;
  try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch { continue; }
  if (buf.length > 4 * 1024 * 1024) continue;
  const text = buf.toString('latin1');
  for (const [name, value] of secrets) {
    if (text.includes(value)) { console.log('LEAK in tracked file: ' + rel + '  (' + name + ')'); hits++; }
  }
}
console.log('tracked files scanned:', tracked.length, '· hits:', hits);

// 2) the session's diffs (all commits since r8)
const diff = execSync('git log -p --no-color 3f19702..HEAD', { cwd: ROOT, maxBuffer: 512 * 1024 * 1024 }).toString('latin1');
let dhits = 0;
for (const [name, value] of secrets) {
  if (diff.includes(value)) { console.log('LEAK in session diff: ' + name); dhits++; }
}
console.log('session diff size:', Math.round(diff.length / 1024), 'KB · hits:', dhits);

console.log(hits + dhits === 0 ? '\nCLEAN — no lab secret in the tree or in this session\'s diffs' : '\nLEAK FOUND');
process.exit(hits + dhits ? 1 : 0);
