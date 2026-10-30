// Shared lab helper: cached login (avoids the 5/min login limit). Never prints the token.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')

const BASE = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
const CACHE = path.join(__dirname, '.token.json')

let cached = null
try { cached = JSON.parse(fs.readFileSync(CACHE, 'utf8')) } catch {}

async function login() {
  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: c.email, password: c.password })
    })
    const js = await res.json().catch(() => ({}))
    if (js.token) {
      fs.writeFileSync(CACHE, JSON.stringify({ token: js.token, at: Date.now() }), 'utf8')
      return js.token
    }
    await new Promise(r => setTimeout(r, 15000))
  }
  throw new Error('login failed after retries')
}

async function getToken(force) {
  if (!force && cached && cached.token && Date.now() - cached.at < 10 * 60 * 1000) return cached.token
  cached = null
  return login()
}

async function api(p, opts = {}, retry = true) {
  const token = await getToken()
  const res = await fetch(BASE + p, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) }
  })
  if (res.status === 401 && retry) {
    await getToken(true)
    return api(p, opts, false)
  }
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, json, text }
}

async function ticket() {
  const r = await api('/api/auth/ws-ticket', { method: 'POST' })
  return r.json && r.json.ticket
}

async function devices() {
  const r = await api('/api/devices')
  const arr = r.json ? (Array.isArray(r.json) ? r.json : r.json.devices || []) : []
  return arr
}

async function deviceId(nameOrId) {
  const list = await devices()
  const d = list.find(x => x.id === nameOrId) || list.find(x => String(x.name || '').toLowerCase() === String(nameOrId).toLowerCase())
  if (!d) throw new Error('device not found: ' + nameOrId + ' (have ' + list.map(x => x.name).join(',') + ')')
  return d.id
}

module.exports = { BASE, getToken, api, ticket, devices, deviceId }
