'use strict'
/**
 * capture-gdi.js — محرّك التقاط بديل لوكيل ويندوز يعتمد BitBlt/GDI من عملية مساعدة.
 *
 * لماذا: على أجهزة VMware المختبرية يُرجع مسار getDisplayMedia/desktopCapturer في
 * Chromium إطاراً أسود 100% بينما السطح سليم. BitBlt يُرجع المحتوى الحقيقي.
 * (قياس 2026-11-03: WebRTC mean=0.0/black=100% · GDI mean=134.9/black=0.1%)
 *
 * العقد:
 *   prewarm()               يبدأ العملية المساعدة مسبقاً (إخفاء زمن الإقلاع ~1.5s)
 *   setSession(sid, opts)   يفعّل تمرير الإطارات لجلسة محددة
 *   clearSession()          يوقف التمرير ويُبقي العملية (إعادة استخدام)
 *   stop()                  يقتل العملية المساعدة
 *   on('frame', cb)         cb({ jpeg, cx, cy, width, height })
 *
 * ملاحظة تعبئة: سكربت PowerShell يُستخرَج من app.asar إلى userData لأن
 * powershell.exe لا يستطيع قراءة مسار داخل أرشيف asar.
 *
 * بروتوكول العملية: [u32 len][u16 cx][u16 cy][u16 sw][u16 sh][u8 flags][jpeg]
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { EventEmitter } = require('events')

const SRC_SCRIPT = path.join(__dirname, 'capture-gdi.ps1')

function scriptDir () {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(base, 'AiRemote Agent')
}

class GdiCapture extends EventEmitter {
  constructor () {
    super()
    this.proc = null
    this.buf = Buffer.alloc(0)
    this.sessionId = null
    this.opts = { fps: 12, quality: 60, maxWidth: 1600 }
    this.frames = 0
    this.discarded = 0
    this.lastError = ''
    this.stopping = false
    this.scriptPath = null
  }

  // يُستخرج مرة واحدة إلى مسار حقيقي (خارج asar) — وإلا فشل spawn صامتاً
  materialize () {
    if (this.scriptPath && fs.existsSync(this.scriptPath)) return this.scriptPath
    try {
      const src = fs.readFileSync(SRC_SCRIPT)
      const dir = scriptDir()
      fs.mkdirSync(dir, { recursive: true })
      const dst = path.join(dir, 'capture-gdi.ps1')
      let same = false
      try { same = fs.existsSync(dst) && fs.readFileSync(dst).equals(src) } catch {}
      if (!same) fs.writeFileSync(dst, src)
      this.scriptPath = dst
      return dst
    } catch (e) {
      this.lastError = 'materialize: ' + e.message
      return null
    }
  }

  get supported () { return process.platform === 'win32' && fs.existsSync(SRC_SCRIPT) }
  get running () { return !!(this.proc && !this.proc.killed) }

  prewarm (opts) {
    if (!this.supported) return false
    if (this.running) return true
    if (opts) this.opts = Object.assign({}, this.opts, opts)
    const script = this.materialize()
    if (!script) return false
    this.stopping = false
    this.buf = Buffer.alloc(0)
    try {
      this.proc = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
        '-Fps', String(this.opts.fps),
        '-Quality', String(this.opts.quality),
        '-MaxWidth', String(this.opts.maxWidth)
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      this.lastError = 'spawn: ' + e.message
      this.proc = null
      return false
    }

    this.proc.stdout.on('data', (chunk) => this._onData(chunk))
    this.proc.stderr.on('data', (d) => {
      const s = String(d || '').trim()
      if (s) this.lastError = s.slice(0, 300)
    })
    this.proc.on('error', (e) => { this.lastError = 'proc: ' + e.message })
    this.proc.on('exit', (code) => {
      this.proc = null
      this.buf = Buffer.alloc(0)
      if (!this.stopping) this.emit('exit', code)
    })
    return true
  }

  _onData (chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    if (this.buf.length > 32 * 1024 * 1024) { this.buf = Buffer.alloc(0); return }
    for (;;) {
      if (this.buf.length < 13) return
      const len = this.buf.readUInt32BE(0)
      if (len <= 0 || len > 16 * 1024 * 1024) {
        this.buf = Buffer.alloc(0)
        this.lastError = 'bad length ' + len
        return
      }
      if (this.buf.length < 13 + len) return
      const cx = this.buf.readUInt16BE(4)
      const cy = this.buf.readUInt16BE(6)
      const width = this.buf.readUInt16BE(8)
      const height = this.buf.readUInt16BE(10)
      const jpeg = this.buf.subarray(13, 13 + len)
      this.buf = this.buf.subarray(13 + len)
      if (!this.sessionId) { this.discarded++; continue }
      this.frames++
      this.emit('frame', { jpeg, cx, cy, width, height, sessionId: this.sessionId })
    }
  }

  // 3.11.9 — أمر للعامل: A=تفعيل (يبدأ الالتقاط) · P=خمول (يتوقف تماماً)
  cmd (c) {
    try {
      if (this.proc && this.proc.stdin && this.proc.stdin.writable) this.proc.stdin.write(c + '\n')
    } catch {}
  }

  setSession (sessionId, opts) {
    this.sessionId = sessionId
    if (opts) this.opts = Object.assign({}, this.opts, opts)
    if (!this.running) this.prewarm()
    this.cmd('A')
  }

  clearSession () { this.sessionId = null; this.cmd('P') }

  stop () {
    this.stopping = true
    this.sessionId = null
    const p = this.proc
    this.proc = null
    if (!p) return
    try { p.kill() } catch {}
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/T', '/F', '/PID', String(p.pid)], { windowsHide: true, stdio: 'ignore' })
    } catch {}
  }
}

module.exports = new GdiCapture()
module.exports.GdiCapture = GdiCapture
