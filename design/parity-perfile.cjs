'use strict'
// Per-file parity: each standalone prototype must carry its own full control set.
// (The old check only looked at mockup-full.html, so gaps in the individual files were invisible.)
const fs = require('fs')
const W = 'C:/Users/admin/AppData/Roaming/AutoClaw-oversea-official/accounts/ba207bd929e7ad7367272dfba67222768ae625cdd8b716878bf860274d23e71a/projects/Default'

const agentRequired = [
  'btn-lang', 'btn-theme', 'btn-tray', 'btn-min', 'btn-close', 'toggle-btn',
  'btn-show-token', 'save-btn', 'reconnect-btn',
  'ctrl-pw-eye', 'save-ctrl-btn', 'clear-ctrl-btn',
  'session-refresh', 'session-request-btn', 'sessions-refresh',
  'chat-clear-btn', 'chat-popout-btn', 'chat-collapse-btn', 'chat-send-btn',
  'ai-hist-btn', 'ai-new-btn', 'ai-stop-btn', 'ai-collapse-btn', 'ai-send-btn',
  'copy-log-btn', 'export-log-btn', 'clear-log', 'log-coll-btn',
  'offer-accept', 'offer-deny'
]
const agentInputs = ['inp-server', 'inp-token', 'ctrl-pw', 'session-device', 'session-pw', 'chat-input', 'ai-input']
const dashRequired = [
  'nav-overview', 'nav-devices', 'nav-ai', 'nav-sessions',
  'dash-search', 'dash-notifications', 'dash-help', 'dash-settings', 'dash-user-menu', 'dash-app-menu',
  'wall-size-s', 'wall-size-m', 'wall-size-l', 'wall-add',
  'tile-play', 'tile-stop', 'tile-max', 'tile-open', 'tile-remove',
  'dash-view-all-devices', 'dash-ai-ask', 'dash-ai-send'
]
const andRequired = [
  'and-a11y-toggle', 'and-capture-toggle', 'and-ctrl-pw-open',
  'and-session-device', 'and-session-refresh', 'and-session-pw', 'and-session-request',
  'and-access-control', 'and-access-view', 'and-access-files',
  'and-log', 'and-sessions', 'and-stop'
]

const files = [
  ['design/server.html', [['السيرفر', dashRequired]]],
  ['design/windows-agent.html', [['وكيل ويندوز — أزرار', agentRequired], ['وكيل ويندوز — حقول', agentInputs]]],
  ['design/android.html', [['أندرويد', andRequired]]]
]

let missingTotal = 0, requiredTotal = 0
const report = []
for (const [file, groups] of files) {
  const html = fs.readFileSync(W + '/' + file, 'utf8')
  const have = new Set([...html.matchAll(/data-feature="([^"]+)"/g)].map(m => m[1]))
  let rows = []
  for (const [name, list] of groups) {
    const missing = list.filter(x => !have.has(x))
    requiredTotal += list.length
    missingTotal += missing.length
    rows.push({ name, ok: list.length - missing.length, total: list.length, missing })
    report.push(file + ' | ' + name + ' | ' + (list.length - missing.length) + '/' + list.length + (missing.length ? ' | ناقص: ' + missing.join(' ') : ' | ✔'))
  }
  console.log('── ' + file + '  (tags=' + have.size + ')')
  for (const r of rows) {
    console.log('   ' + r.name + ': ' + r.ok + '/' + r.total + (r.missing.length ? '   ناقص: ' + r.missing.join(', ') : '   ✔'))
  }
}
console.log('')
console.log('REQUIRED=' + requiredTotal + '  MISSING=' + missingTotal)
fs.writeFileSync(W + '/work/parity-perfile.txt', report.join('\n'), 'utf8')
process.exit(missingTotal ? 1 : 0)
