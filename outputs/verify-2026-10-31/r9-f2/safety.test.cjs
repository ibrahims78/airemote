/**
 * Unit — agent command guard (R9.2 / F2).
 * Run: node packages/agent-desktop/test/safety.test.cjs
 */
'use strict'
const path = require('path')
const { blockedReason } = require(path.resolve(__dirname, '..', 'lib', 'safety.js'))

let failed = false
const check = (d, c) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d); failed = true } }

// destructive commands are refused, with a named reason
check('format C: is blocked', blockedReason('format C: /q') === 'disk format')
check('format d: without flags is blocked', blockedReason('FORMAT D:') === 'disk format')
check('rd /s /q C:\\Windows is blocked', blockedReason('rd /s /q C:\\Windows') === 'system directory wipe')
check('del /f /s /q C:\\Windows\\System32 is blocked', blockedReason('del /f /s /q C:\\Windows\\System32\\*') === 'system directory wipe')
check('reg delete HKLM\\SYSTEM is blocked', blockedReason('reg delete HKLM\\SYSTEM\\CurrentControlSet /f') === 'registry hive deletion')
check('shutdown /s /t 0 is blocked', blockedReason('shutdown /s /t 0') === 'zero-delay shutdown')
check('shutdown /r /t 0 is blocked', blockedReason('shutdown /r /t 0') === 'zero-delay shutdown')
check('vssadmin delete shadows is blocked', blockedReason('vssadmin delete shadows /all /quiet') === 'backup/shadow copy deletion')
check('bcdedit /delete is blocked', blockedReason('bcdedit /delete {current}') === 'boot entry deletion')
check('cipher /w is blocked', blockedReason('cipher /w:C:\\temp') === 'free-space wipe')
check('mkfs is blocked', blockedReason('mkfs.ext4 /dev/sda1') === 'raw disk destruction')
check('rm -rf / is blocked', blockedReason('rm -rf /') === 'rm -rf /')

// ordinary support commands must keep working
const allowed = [
  'ipconfig /all',
  'dir C:\\Users',
  'powershell -NoProfile -Command Get-Process',
  'shutdown /r /t 60',
  'shutdown /a',
  'reg query HKLM\\SOFTWARE\\Microsoft',
  'sc query spooler',
  'format report.docx',
  'del /q C:\\Users\\admin\\AppData\\Local\\Temp\\old.log'
]
for (const cmd of allowed) check('allowed: ' + cmd, blockedReason(cmd) === '')

// The server keeps a copy (it wraps commands before the agent sees them).
// Refuse drift: both lists must stay byte-for-byte equivalent in effect.
const serverSafety = require(path.resolve(__dirname, '..', '..', 'server-desktop', 'lib', 'safety.js'))
const fingerprint = (m) => m.BLOCKED_COMMANDS.map((x) => x.re.source + '|' + x.re.flags + '|' + x.reason).join('\n')
check('server and agent block lists match', fingerprint(serverSafety) === fingerprint(require(path.resolve(__dirname, '..', 'lib', 'safety.js'))))
check('empty command is not blocked', blockedReason('') === '')
check('null is not blocked', blockedReason(null) === '')

console.log('')
if (failed) { console.error('SAFETY TEST FAILED'); process.exit(1) }
console.log('SAFETY TEST PASSED')
