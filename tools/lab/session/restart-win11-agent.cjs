'use strict'
const { execFileSync } = require('child_process')
const remote = require('D:/autoclaw projects-new/AiRemote/tools/lab/remote.cjs')
const fs = require('fs')

const CRED = 'C:/Users/admin/AppData/Roaming/AiRemote/lab-credentials.txt'
const lines = fs.readFileSync(CRED, 'utf8').split(/\r?\n/)
const pick = (k) => {
  const l = lines.find(x => new RegExp('^\\s*' + k + '\\s*[:=]').test(x)) || ''
  return l.replace(/^[^:=]+[:=]\s*/, '').trim()
}
const user = pick('vm_guest_user')
const pass = pick('vm_guest_password')
const vmrun = 'C:/Program Files (x86)/VMware/VMware Workstation/vmrun.exe'
const vmx = 'E:/VMs/Win11_Custom_2026-09-30/Win11_Custom_2026-09-30.vmx'
const exe = 'C:/Users/admin/AppData/Local/Programs/AiRemote Agent/AiRemote Agent.exe'

;(async () => {
  const kill = await remote.run('WIN11-VM', "Get-Process | Where-Object { $_.ProcessName -like 'AiRemote*' } | Stop-Process -Force")
  console.log('kill', kill.status, kill.stderr.slice(0, 80))
  await new Promise(r => setTimeout(r, 2500))
  const out = execFileSync(vmrun, ['-T', 'ws', '-gu', user, '-gp', pass, 'runProgramInGuest', vmx, '-interactive', exe, '--force-renderer-accessibility'], { encoding: 'utf8' })
  console.log('started', String(out).trim())
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
