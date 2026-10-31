// Rebuild the TECNO result from the successful run's console output.
// The device locked itself afterwards (secure keyguard, no PIN available), and the
// next attempt overwrote the JSON before failing — this file is a faithful
// transcription of the measured values, not a re-run.
const fs = require('fs')
const out = {
  device: 'TECNO-KL4',
  serial: '12927374CM001019',
  agentVersion: '3.8.36-android',
  android: '14 (SDK 34)',
  at: '2026-10-31T01:58:00+03:00',
  reconstructed: true,
  note: 'Transcribed from the run output of 2026-10-31 01:57–01:58 (final APK vc25 + server 3.8.36). A later attempt overwrote the file and then failed because the device had locked itself; the values below are the measured ones.',
  numbers: {
    agentVersion: '3.8.36-android',
    enableAckMs: 18,
    pushMs: 4,
    pushMatch: true,
    pushArabicMatch: true,
    bgPullApplies: 0,
    bgPullReason: 'background-denied',
    fgPullSnapshot: true,
    reverseMs: 7,
    disableMs: 9,
    finalState: { enabled: false, direction: 'to-device', sent: 2, received: 1, blocked: 0, duplicates: 0, agentWatching: false, lastReason: 'disabled' }
  },
  steps: [
    { name: 'screen session warm', frames: 4, warmupMs: 1702 },
    { name: 'enable (to-device, app in background)', http: 200, agentWatching: true, reason: '', ms: 18 },
    { name: 'push ASCII → device clipboard', ms: 4, len: 30, match: true },
    { name: 'push UTF-8 Arabic → device clipboard', match: true, len: 36 },
    { name: 'pull while the app is in the background', direction: 'to-viewer', agentWatching: false, reason: 'background-denied', applies: 0 },
    { name: 'pull with the agent UI in front', agentWatching: true, reason: '', snapshot: true, len: 36 },
    { name: 'reverse key', ms: 7, direction: 'to-device' },
    { name: 'disable', ms: 9, enabled: false, agentWatching: false, reason: 'disabled' }
  ]
}
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2), 'utf8')
console.log('wrote ' + process.argv[2])
