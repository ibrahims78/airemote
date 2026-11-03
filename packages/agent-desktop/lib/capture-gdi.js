'use strict'
/**
 * capture-gdi.js — محرّك التقاط بديل لوكيل ويندوز يعتمد BitBlt/GDI من عملية مساعدة.
 *
 * لماذا: على أجهزة VMware المختبرية يُرجع مسار getDisplayMedia/desktopCapturer في
 * Chromium إطاراً أسود 100% بينما السطح سليم. BitBlt يُرجع المحتوى الحقيقي.
 * (قياس 2026-11-03: WebRTC mean=0.0/black=100% · GDI mean=134.9/black=0.1%)
 *
 * 3.11.10 — عاملان بترتيب تفضيل:
 *   1) `bin/capture-gdi-worker.exe` مُترجم مسبقاً بـcsc.exe وقت البناء (لا Add-Type،
 *      ولا إقلاع powershell) ⇒ ~2s أقل على المسار الحرج.
 *   2) `capture-gdi.ps1` (Add-Type) بديل تلقائي إن غاب الـexe أو فشل قبل أول إطار.
 *   البروتوكول متطابق في الاثنين، فالسيرفر والعارض لا يعرفان أيّهما يعمل.
 *
 * العقد:
 *   prewarm()               يبدأ العملية المساعدة مسبقاً (إخفاء زمن الإقلاع)
 *   setSession(sid, opts)   يفعّل تمرير الإطارات لجلسة محددة
 *   clearSession()          يوقف التمرير ويُبقي العملية (إعادة استخدام)
 *   stop()                  يقتل العملية المساعدة
 *   on('frame', cb)         cb({ jpeg, cx, cy, width, height })
 *   .engine                 'exe' | 'ps1' (للتشخيص والسجل)
 *
 * ملاحظة تعبئة: الأصل يُستخرج من app.asar إلى userData لأن العملية الخارجية
 * لا تستطيع قراءة مسار داخل الأرشيف.
 *
 * بروتوكول العملية: [u32 len][u16 cx][u16 cy][u16 sw][u16 sh][u8 flags][jpeg]
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { EventEmitter } = require('events')

const SRC_SCRIPT = path.join(__dirname, 'capture-gdi.ps1')
const SRC_WORKER = path.join(__dirname, 'bin', 'capture-gdi-worker.exe')

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
    this.workerPath = null
    this.engine = null
    this.fallbackTried = false
    this.startedAt = 0
    this.framesAtSpawn = 0
    this._exitHandled = false
  }

  _copyOut (srcFile, name) {
    const src = fs.readFileSync(srcFile)
    const dir = scriptDir()
    fs.mkdirSync(dir, { recursive: true })
    const dst = path.join(dir, name)
    let same = false
    try { same = fs.existsSync(dst) && fs.readFileSync(dst).equals(src) } catch {}
    if (!same) fs.writeFileSync(dst, src)
    return dst
  }

  // يُستخرج مرة واحدة إلى مسار حقيقي (خارج asar) — وإلا فشل spawn صامتاً
  materialize () {
    if (this.scriptPath && fs.existsSync(this.scriptPath)) return this.scriptPath
    try {
      this.scriptPath = this._copyOut(SRC_SCRIPT, 'capture-gdi.ps1')
      return this.scriptPath
    } catch (e) {
      this.lastError = 'materialize: ' + e.message
      return null
    }
  }

  // اسم مُبصَّم بالمحتوى: تحديث الوكيل لا يصطدم بعامل قديم قيد التشغيل (EBUSY على ويندوز)
  materializeWorker () {
    if (this.workerPath && fs.existsSync(this.workerPath)) return this.workerPath
    if (!fs.existsSync(SRC_WORKER)) return null
    try {
      const tag = crypto.createHash('sha256').update(fs.readFileSync(SRC_WORKER)).digest('hex').slice(0, 8)
      this.workerPath = this._copyOut(SRC_WORKER, 'capture-gdi-worker-' + tag + '.exe')
      return this.workerPath
    } catch (e) {
      this.lastError = 'materializeWorker: ' + e.message
      return null
    }
  }

  get supported () { return process.platform === 'win32' && (fs.existsSync(SRC_WORKER) || fs.existsSync(SRC_SCRIPT)) }
  get running () { return !!(this.proc && !this.proc.killed) }

  prewarm (opts) {
    if (!this.supported) return false
    if (this.running) return true
    if (opts) this.opts = Object.assign({}, this.opts, opts)
    this.stopping = false
    this.buf = Buffer.alloc(0)
    this._exitHandled = false

    if (this.engine !== 'ps1') {
      const worker = this.materializeWorker()
      if (worker) {
        const ok = this._spawn(worker, [
          '-Fps', String(this.opts.fps),
          '-Quality', String(this.opts.quality),
          '-MaxWidth', String(this.opts.maxWidth)
        ], 'exe')
        if (ok) return true
      }
    }

    const script = this.materialize()
    if (!script) return false
    return this._spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
      '-Fps', String(this.opts.fps),
      '-Quality', String(this.opts.quality),
      '-MaxWidth', String(this.opts.maxWidth)
    ], 'ps1')
  }

  _spawn (cmd, args, engine) {
    let proc
    try {
      proc = spawn(cmd, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      this.lastError = 'spawn: ' + e.message
      this.proc = null
      return false
    }

    this.proc = proc
    this.engine = engine
    this.startedAt = Date.now()
    this.framesAtSpawn = this.frames

    const settle = (why) => {
      if (this._exitHandled) return
      this._exitHandled = true
      if (this.proc === proc) this.proc = null
      this.buf = Buffer.alloc(0)
      if (this.stopping) return
      // 3.11.10 — العامل المُترجم خرج قبل أي إطار (حجب/تلف): رجوع صامت إلى PowerShell
      const early = Date.now() - this.startedAt < 4000 && this.frames === this.framesAtSpawn
      if (engine === 'exe' && early && !this.fallbackTried) {
        this.fallbackTried = true
        this.lastError = (this.lastError || ('exe exit ' + why)) + ' → ps1'
        this.engine = 'ps1'
        if (this.prewarm()) { if (this.sessionId) this.cmd('A') }
        return
      }
      this.emit('exit', typeof why === 'number' ? why : -1)
    }

    proc.stdout.on('data', (chunk) => this._onData(chunk))
    proc.stderr.on('data', (d) => {
      const s = String(d || '').trim()
      if (s) this.lastError = s.slice(0, 300)
    })
    proc.on('error', (e) => { this.lastError = 'proc: ' + e.message; settle(-1) })
    proc.on('exit', (code) => settle(code))
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

  // أمر للعامل: A=تفعيل (يبدأ الالتقاط) · P=خمول (يتوقف تماماً)
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
    this.fallbackTried = false
    this._exitHandled = true
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
