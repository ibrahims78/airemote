#!/usr/bin/env node
'use strict'
/**
 * fake-server.cjs — the smallest server the agent will accept, so the UI's CONNECTED
 * state can be exercised without touching the real database or a real device row.
 *
 * Protocol (from packages/agent-desktop/main.js):
 *   agent -> {type:'agent:register', payload:{token, info:{agentVersion}, ...}}
 *   server -> {type:'server:registered', payload:{deviceId}}   => setState('connected')
 *
 * Usage: node tools/lab/session/fake-server.cjs [port] [logFile]
 */
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..', '..', '..')
const wsPkg = require(path.join(ROOT, 'packages', 'agent-desktop', 'node_modules', 'ws'))
const { WebSocketServer } = wsPkg

const port = Number(process.argv[2] || 4599)
const logFile = process.argv[3] || ''
const lines = []
function log (s) {
  const line = new Date().toISOString().slice(11, 19) + ' ' + s
  lines.push(line)
  console.log(line)
  if (logFile) fs.writeFileSync(logFile, lines.join('\n') + '\n', 'utf8')
}

const wss = new WebSocketServer({ host: '127.0.0.1', port })
wss.on('listening', () => log('listening ws://127.0.0.1:' + port))
wss.on('connection', (sock, req) => {
  log('connection from ' + (req.socket.remoteAddress || '?'))
  sock.on('message', (buf) => {
    let msg = null
    try { msg = JSON.parse(buf.toString()) } catch { return }
    const type = msg && msg.type
    if (type === 'agent:register') {
      const p = (msg.payload || {})
      log('register tokenLen=' + String(p.token || '').length +
          ' agent=' + ((p.info && p.info.agentVersion) || '?') +
          ' host=' + ((p.info && p.info.hostname) || '?'))
      sock.send(JSON.stringify({ type: 'server:registered', payload: { deviceId: 'probe-device-0001' }, timestamp: Date.now() }))
      log('-> server:registered')
    } else if (type === 'agent:pong') {
      log('pong')
    } else {
      log('msg ' + type)
    }
  })
  sock.on('close', () => log('closed'))
  sock.on('error', (e) => log('socket error ' + e.message))
})
process.on('SIGTERM', () => { try { wss.close() } catch {} ; process.exit(0) })
