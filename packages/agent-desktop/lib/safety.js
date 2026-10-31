'use strict'
/**
 * lib/safety.js — v3.8.41 (R9.2 / F2)
 *
 * The Windows desktop agent runs raw shell commands for an authenticated
 * manager. The headless agent has carried a block list since R2; the desktop
 * agent did not, so an accidental (or model-issued) `format C:` executed.
 *
 * This is defence in depth, not a privilege boundary: the caller already owns
 * the device. It exists so a single mistaken line cannot destroy a machine.
 *
 * Kept as its own module so it can be unit-tested without booting Electron.
 */

const BLOCKED_COMMANDS = [
  { re: /\bformat\s+[a-z]:/i, reason: 'disk format' },
  { re: /\b(rd|rmdir)\s+(\/[a-z]+\s+)*[a-z]:\\(windows|system32)/i, reason: 'system directory wipe' },
  { re: /\bdel\s+(\/[a-z]+\s+)*[a-z]:\\(windows|system32)/i, reason: 'system directory wipe' },
  { re: /\breg\s+delete\s+hklm\\(system|sam|security)/i, reason: 'registry hive deletion' },
  { re: /\bshutdown\s+(\/s|\/r|\/p)\s+\/t\s+0\b/i, reason: 'zero-delay shutdown' },
  { re: /\b(vssadmin|wbadmin)\s+delete\b/i, reason: 'backup/shadow copy deletion' },
  { re: /\bbcdedit\b[^\r\n]*\/delete\b/i, reason: 'boot entry deletion' },
  { re: /\bcipher\s+\/w\b/i, reason: 'free-space wipe' },
  { re: /\bmkfs\b|\bdd\b[^\r\n]*of=\/dev\/(sd|nvme)/i, reason: 'raw disk destruction' },
  { re: /rm\s+-[rRf]{1,3}\s+\/(\s|$)/, reason: 'rm -rf /' }
]

function blockedReason(command) {
  const cmd = String(command == null ? '' : command)
  for (const entry of BLOCKED_COMMANDS) {
    if (entry.re.test(cmd)) return entry.reason
  }
  return ''
}

module.exports = { BLOCKED_COMMANDS, blockedReason }
