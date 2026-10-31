'use strict'
const fs = require('fs')
const { execFileSync } = require('child_process')
const REPO = 'D:/autoclaw projects-new/AiRemote'
const CRED = 'C:/Users/admin/AppData/Roaming/AiRemote/lab-credentials.txt'
const lines = fs.readFileSync(CRED, 'utf8').split(/\r?\n/)
const pick = (k) => (lines.find(x => new RegExp('^\\s*' + k + '\\s*[:=]').test(x)) || '').replace(/^[^:=]+[:=]\s*/, '').trim()
const user = pick('vm_guest_user'); const pass = pick('vm_guest_password')
const vmrun = 'C:/Program Files (x86)/VMware/VMware Workstation/vmrun.exe'
const asar = REPO + '/releases/agent-windows/win-unpacked/resources/app.asar'
const vms = [
  ['WIN11-VM', 'E:/VMs/Win11_Custom_2026-09-30/Win11_Custom_2026-09-30.vmx'],
  ['WIN10-VM', 'E:/VMs/Win10_Pro_Custom/Win10_Pro_Custom.vmx'],
]
const swapPs1 = 'C:/Users/admin/AppData/Roaming/AutoClaw-oversea-official/accounts/26491370a24dbc0ecb519bb59b93879b3d05be8f9398f349f99a82d7d94064a7/projects/Default/v39/swap-agent.ps1'
const startExe = 'C:\\Users\\admin\\AppData\\Local\\Programs\\AiRemote Agent\\AiRemote Agent.exe'

for (const [name, vmx] of vms) {
  try {
    console.log(name + ' copying app.asar…')
    execFileSync(vmrun, ['-T', 'ws', '-gu', user, '-gp', pass, 'copyFileFromHostToGuest', vmx, asar, 'C:\\Users\\admin\\new-app.asar'], { encoding: 'utf8', timeout: 120000 })
    execFileSync(vmrun, ['-T', 'ws', '-gu', user, '-gp', pass, 'copyFileFromHostToGuest', vmx, swapPs1, 'C:\\Users\\admin\\swap-agent.ps1'], { encoding: 'utf8', timeout: 60000 })
    execFileSync(vmrun, ['-T', 'ws', '-gu', user, '-gp', pass, 'runProgramInGuest', vmx, '-interactive', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Users\\admin\\swap-agent.ps1'], { encoding: 'utf8', timeout: 120000 })
    console.log(name + ' swapped')
    execFileSync(vmrun, ['-T', 'ws', '-gu', user, '-gp', pass, 'runProgramInGuest', vmx, '-interactive', '-noWait', startExe], { encoding: 'utf8', timeout: 60000 })
    console.log(name + ' started')
  } catch (e) {
    console.log(name + ' ERR ' + String(e.message).split('\n')[0])
  }
}
