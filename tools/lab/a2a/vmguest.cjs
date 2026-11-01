'use strict'
/**
 * أداة مختبر صغيرة: تشغيل أوامر داخل WIN10/WIN11 عبر vmrun.
 * لا تطبع أي سرّ. تقرأ بيانات اعتماد الضيف من ملف المختبر.
 *
 * الاستخدام:
 *   node brief/vmguest.cjs probe                 # whoami / sessions / tasklist / screen
 *   node brief/vmguest.cjs start-agent           # تشغيل وكيل AiRemote تفاعلياً
 *   node brief/vmguest.cjs ps <vm> <script.ps1>  # نسخ سكربت وتشغيله، وإرجاع مخرجاته
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const CRED = 'C:/Users/admin/AppData/Roaming/AiRemote/lab-credentials.txt'
const lines = fs.readFileSync(CRED, 'utf8').split(/\r?\n/)
const pick = (k) => (lines.find(x => new RegExp('^\\s*' + k + '\\s*[:=]').test(x)) || '').replace(/^[^:=]+[:=]\s*/, '').trim()
const USER = pick('vm_guest_user')
const PASS = pick('vm_guest_password')
const VMRUN = 'C:/Program Files (x86)/VMware/VMware Workstation/vmrun.exe'

const VMS = {
  win10: 'E:/VMs/Win10_Pro_Custom/Win10_Pro_Custom.vmx',
  win11: 'E:/VMs/Win11_Custom_2026-09-30/Win11_Custom_2026-09-30.vmx',
}

function sanitize (s) {
  let t = String(s || '')
  if (PASS) t = t.split(PASS).join('***')
  if (USER) t = t.split(USER).join('***')
  return t
}
function runSafe (fn) {
  try { return fn() } catch (e) {
    const raw = (e.stderr ? e.stderr.toString() : '') + ' | ' + (e.stdout ? e.stdout.toString() : '')
    throw new Error(sanitize(raw).replace(/\s+/g, ' ').trim().slice(0, 400) || sanitize(e.message))
  }
}

function vm (name) {
  const vmx = VMS[String(name).toLowerCase()]
  if (!vmx) throw new Error('unknown vm: ' + name)
  return vmx
}
function base (name) { return ['-T', 'ws', '-gu', USER, '-gp', PASS] }
function run (name, argv, opts = {}) {
  const vmx = vm(name)
  return runSafe(() => execFileSync(VMRUN, [...base(name), ...argv.slice(0, 1), vmx, ...argv.slice(1)], { encoding: 'utf8', timeout: opts.timeout || 180000 }))
}
function copyIn (name, hostPath, guestPath) {
  run(name, ['copyFileFromHostToGuest', hostPath, guestPath])
}
function copyOut (name, guestPath, hostPath) {
  run(name, ['copyFileFromGuestToHost', guestPath, hostPath])
}
function ps (name, psFile, guestName) {
  const guest = 'C:\\Users\\admin\\' + (guestName || path.basename(psFile))
  copyIn(name, psFile, guest)
  run(name, ['runProgramInGuest', '-interactive', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', guest], { timeout: 240000 })
  // المخرج يُكتب من السكربت نفسه إلى out.txt
  const outGuest = guest.replace(/\.ps1$/, '') + '.out.txt'
  const outHost = path.join(__dirname, 'vm-' + name + '-' + path.basename(psFile, '.ps1') + '.out.txt')
  try { copyOut(name, outGuest, outHost); return fs.readFileSync(outHost, 'utf8') } catch (e) { return '(no output file: ' + e.message.split('\n')[0] + ')' }
}
function startAgent (name) {
  const exe = 'C:\\Users\\admin\\AppData\\Local\\Programs\\AiRemote Agent\\AiRemote Agent.exe'
  run(name, ['runProgramInGuest', '-interactive', '-noWait', exe])
  return 'started ' + name
}

module.exports = { VMS, VMRUN, USER, PASS, run, copyIn, copyOut, ps, startAgent }

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2)
  try {
    if (cmd === 'probe') {
      const p = path.join(__dirname, 'probe.ps1')
      fs.writeFileSync(p, [
        '$o = New-Object System.Collections.ArrayList',
        "[void]$o.Add('USER=' + $env:USERNAME)",
        "[void]$o.Add('COMP=' + $env:COMPUTERNAME)",
        "[void]$o.Add('SESSION=' + ((query session 2>&1) -join ' / '))",
        "[void]$o.Add('AGENTPROC=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)",
        "[void]$o.Add('EXPLORER=' + @(Get-Process explorer -ErrorAction SilentlyContinue).Count)",
        "Add-Type -AssemblyName System.Windows.Forms",
        '$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen',
        "[void]$o.Add('VIRTUAL=' + $vs.X + ',' + $vs.Y + ' ' + $vs.Width + 'x' + $vs.Height)",
        "[void]$o.Add('SCREENS=' + ([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $_.DeviceName + ':' + $_.Bounds.Width + 'x' + $_.Bounds.Height + '@' + $_.Bounds.X + ',' + $_.Bounds.Y } ) -join ' | ')",
        "[void]$o.Add('DPI=' + (Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -Name LogPixels -ErrorAction SilentlyContinue).LogPixels)",
        "[void]$o.Add('TASKS=' + ((tasklist | Select-String -Pattern 'AiRemote|electron' ) -join ' / '))",
        '$o | Set-Content -Encoding UTF8 C:\\Users\\admin\\probe.out.txt',
      ].join('\r\n'), 'utf8')
      for (const n of Object.keys(VMS)) {
        try { console.log('=== ' + n + ' ===\n' + ps(n, p, 'probe.ps1')) } catch (e) { console.log('=== ' + n + ' === ERR ' + e.message.split('\n')[0]) }
      }
    } else if (cmd === 'start-agent') {
      for (const n of (rest.length ? rest : Object.keys(VMS))) {
        try { console.log(startAgent(n)) } catch (e) { console.log(n + ' ERR ' + e.message.split('\n')[0]) }
      }
    } else if (cmd === 'shot') {
      const p = path.join(__dirname, 'shot.ps1')
      fs.writeFileSync(p, [
        'Add-Type -AssemblyName System.Windows.Forms',
        'Add-Type -AssemblyName System.Drawing',
        '$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen',
        '$bmp = New-Object System.Drawing.Bitmap $vs.Width, $vs.Height',
        '$g = [System.Drawing.Graphics]::FromImage($bmp)',
        '$g.CopyFromScreen($vs.X, $vs.Y, 0, 0, $bmp.Size)',
        '$bmp.Save(' + "'C:\\Users\\admin\\shot.png'" + ', [System.Drawing.Imaging.ImageFormat]::Png)',
        '$g.Dispose(); $bmp.Dispose()',
        "Set-Content -Encoding UTF8 C:\\Users\\admin\\shot.out.txt 'ok'",
      ].join('\r\n'), 'utf8')
      for (const n of (rest.length ? rest : Object.keys(VMS))) {
        try {
          ps(n, p, 'shot.ps1')
          const dst = path.join(__dirname, 'guest-' + n + '.png')
          copyOut(n, 'C:\\Users\\admin\\shot.png', dst)
          console.log(n + ' shot -> ' + dst + ' (' + fs.statSync(dst).size + ' bytes)')
        } catch (e) { console.log(n + ' ERR ' + sanitize(e.message)) }
      }
    } else if (cmd === 'ps') {
      console.log(ps(rest[0], rest[1]))
    } else {
      console.log('usage: probe | start-agent [vm...] | ps <vm> <file.ps1>')
    }
  } catch (e) { console.error('ERR ' + sanitize(e.message)); process.exit(1) }
}
