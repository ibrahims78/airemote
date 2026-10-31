'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const lab = require(path.join(__dirname, 'lab.cjs'))
;(async () => {
  const a = await lab.api('/api/audit?limit=200')
  const j = a.json
  const rows = Array.isArray(j) ? j : (j && (j.rows || j.audit || j.entries || j.data)) || []
  console.log('rows=' + rows.length + ' keys=' + (Array.isArray(j) ? 'array' : Object.keys(j || {}).join(',')))
  rows.filter(r => /^session/.test(String(r.action || ''))).slice(0, 14)
    .forEach(r => console.log(r.created_at + ' ' + r.action + ' ' + String(r.details || '').slice(0, 100)))
})()
