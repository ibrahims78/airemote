const Database = require('better-sqlite3')
const path = require('path')
const db = new Database(path.join(process.env.APPDATA, 'AiRemote-Server', 'airemote.db'), { readonly: true })
const rows = db.prepare('SELECT id,title,updated_at,messages FROM ai_conversations ORDER BY updated_at DESC LIMIT 3').all()
for (const r of rows) {
  console.log('---', r.id, r.title, r.updated_at)
  try {
    const m = JSON.parse(r.messages)
    console.log(m.map(x => x.role + ': ' + String(x.content).slice(0, 200)).join('\n'))
  } catch (e) { console.log('parse err', e.message) }
}
