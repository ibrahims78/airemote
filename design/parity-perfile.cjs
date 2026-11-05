'use strict'
// Per-file parity: every prototype must carry its own full control set.
// Self-contained: run from anywhere inside the repo (node design/attrscan.cjs).
const fs = require('fs'), path = require('path')
const R = __dirname

const agentButtons = ['btn-lang','btn-theme','btn-tray','btn-min','btn-close','toggle-btn','btn-show-token','save-btn','reconnect-btn','ctrl-pw-eye','save-ctrl-btn','clear-ctrl-btn','session-refresh','session-request-btn','sessions-refresh','chat-clear-btn','chat-popout-btn','chat-collapse-btn','chat-send-btn','ai-hist-btn','ai-new-btn','ai-stop-btn','ai-collapse-btn','ai-send-btn','copy-log-btn','export-log-btn','clear-log','log-coll-btn','offer-accept','offer-deny']
const agentInputs = ['inp-server','inp-token','ctrl-pw','session-device','session-pw','chat-input','ai-input']
const dash = ['nav-overview','nav-devices','nav-ai','nav-sessions','dash-search','dash-notifications','dash-help','dash-settings','dash-user-menu','dash-app-menu','wall-size-s','wall-size-m','wall-size-l','wall-add','tile-play','tile-stop','tile-max','tile-open','tile-remove','dash-view-all-devices','dash-ai-ask','dash-ai-send']
const and = ['and-a11y-toggle','and-capture-toggle','and-ctrl-pw-open','and-session-device','and-session-refresh','and-session-pw','and-session-request','and-access-control','and-access-view','and-access-files','and-log','and-sessions','and-stop']

const files = [['server.html',[['السيرفر',dash]]],['windows-agent.html',[['وكيل ويندوز — أزرار',agentButtons],['وكيل ويندوز — حقول',agentInputs]]],['android.html',[['أندرويد',and]]]]
let miss = 0, req = 0
for (const [f, groups] of files) {
  const html = fs.readFileSync(path.join(R, f), 'utf8')
  const have = new Set([...html.matchAll(/data-feature="([^"]+)"/g)].map(m => m[1]))
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1])
  console.log('── ' + f + '  (tags=' + have.size + (tabs.length ? ', tabs=' + tabs.join(',') : '') + ')')
  for (const [name, list] of groups) {
    const missing = list.filter(x => !have.has(x))
    req += list.length; miss += missing.length
    console.log('   ' + name + ': ' + (list.length - missing.length) + '/' + list.length + (missing.length ? '   ناقص: ' + missing.join(', ') : '   ✔'))
  }
}
console.log('\nREQUIRED=' + req + '  MISSING=' + miss)
process.exit(miss ? 1 : 0)
