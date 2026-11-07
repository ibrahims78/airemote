'use strict'
/**
 * guest-exec.cjs — run a PowerShell file inside a lab VM through vmrun, return its out.txt.
 * Usage: node guest-exec.cjs <win10|win11> <local.ps1> [remoteOutName]
 * Credentials come from lab-credentials.txt; nothing secret is printed.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const VMRUN = 'C:/Program Files (x86)/VMware/VMware Workstation/vmrun.exe'
const CRED = 'C:/Users/admin/AppData/Roaming/AiRemote/lab-credentials.txt'
const VMS = {
  win10: 'E:/VMs/Win10_Pro_Custom/Win10_Pro_Custom.vmx',
  win11: 'E:/VMs/Win11_Custom_2026-09-30/Win11_Custom_2026-09-30.vmx'
}

const lines = fs.readFileSync(CRED, 'utf8').split(/\r?\n/)
const pick = (k) => (lines.find(x => new RegExp('^\\s*' + k + '\\s*[:=]').test(x)) || '').replace(/^[^:=]+[:=]\s*/, '').trim()
const USER = pick('vm_guest_user')
const PASS = pick('vm_guest_password')

const name = (process.argv[2] || 'win11').toLowerCase()
const local = path.resolve(process.argv[3])
const outName = process.argv[4] || 'out-guest.txt'
const vmx = VMS[name]
if (!vmx) { console.error('unknown vm'); process.exit(2) }

const base = ['-T', 'ws', '-gu', USER, '-gp', PASS]
const remotePs = 'C:\\Users\\admin\\' + path.basename(local)
const remoteOut = 'C:\\Users\\admin\\' + outName
const hostOut = path.join(path.dirname(local), outName)

function vmrun (args, timeout = 240000) {
  return execFileSync(VMRUN, [...base, ...args], { encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 })
}

try {
  vmrun(['copyFileFromHostToGuest', vmx, local, remotePs])
  vmrun(['runProgramInGuest', vmx, '-interactive', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', remotePs], 240000)
  try { vmrun(['copyFileFromGuestToHost', vmx, remoteOut, hostOut]) } catch (e) { console.error('no out file: ' + String(e.message).slice(0, 120)) }
  if (fs.existsSync(hostOut)) process.stdout.write(fs.readFileSync(hostOut, 'utf8'))
} catch (e) {
  const raw = ((e.stderr || '') + ' ' + (e.stdout || '') + ' ' + e.message)
  const safe = raw.split(PASS).join('***').split(USER).join('***').replace(/\s+/g, ' ').slice(0, 500)
  console.error('GUEST FAILED: ' + safe)
  process.exit(1)
}
