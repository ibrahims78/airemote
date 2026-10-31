'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const CRED = 'C:/Users/admin/AppData/Roaming/AiRemote/lab-credentials.txt'
const lines = fs.readFileSync(CRED, 'utf8').split(/\r?\n/)
const pick = (k) => (lines.find(x => new RegExp('^\\s*' + k + '\\s*[:=]').test(x)) || '').replace(/^[^:=]+[:=]\s*/, '').trim()
const user = pick('vm_guest_user'); const pass = pick('vm_guest_password')
const vmrun = 'C:/Program Files (x86)/VMware/VMware Workstation/vmrun.exe'
const vmx = 'E:/VMs/Win11_Custom_2026-09-30/Win11_Custom_2026-09-30.vmx'

;(async () => {
  const r = await lab.api('/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDeviceId: 'd147684b-2451-4418-a628-86f11aa66a4e', access: 'control', requesterDeviceId: 'b42175d0-d0c9-428d-ab94-4e66dff56af3' })
  })
  console.log('request', r.status, r.json && r.json.sessionId)
  if (r.status !== 201) return
  const sid = r.json.sessionId
  await new Promise(x => setTimeout(x, 2000))
  execFileSync(vmrun, ['-T', 'ws', '-gu', user, '-gp', pass, 'runProgramInGuest', vmx, '-interactive', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Users\\admin\\click-at.ps1'], { encoding: 'utf8', timeout: 60000 })
  console.log('clicked')
  for (let i = 0; i < 8; i++) {
    await new Promise(x => setTimeout(x, 800))
    const s = await lab.api('/api/relay/' + sid)
    const st = s.json && s.json.state
    console.log('state', st)
    if (st === 'active' || st === 'denied') break
  }
  console.log('SID=' + sid)
})()
