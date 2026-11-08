'use strict';
// db-usage probe: read-only row counts per table in the live DB.
// Purpose: a data-shaped answer for P2 without shipping instrumentation.
// Read-only feature-usage proxy: row counts per table in the live DB.
// Purpose: give P2 a data-shaped answer without shipping instrumentation.
const { DatabaseSync } = require('node:sqlite');

const DB = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote-Server\\airemote.db';
const db = new DatabaseSync(DB, { readOnly: true });

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
console.log('tables:', tables.length);

const rows = [];
for (const t of tables) {
  const name = t.name;
  let count = 0;
  try { count = db.prepare('SELECT COUNT(*) AS c FROM "' + name + '"').get().c; } catch { count = -1; }
  // newest timestamp-ish column, if any
  let last = '';
  try {
    const cols = db.prepare('PRAGMA table_info("' + name + '")').all().map((c) => c.name);
    const stamp = cols.find((c) => /^(created_at|updated_at|started_at|ts|timestamp|last_seen|at)$/.test(c));
    if (stamp && count > 0) {
      const r = db.prepare('SELECT MAX("' + stamp + '") AS m FROM "' + name + '"').get();
      last = r && r.m ? String(r.m) : '';
    }
  } catch {}
  rows.push({ name, count, last });
}

rows.sort((a, b) => b.count - a.count);
console.log('\n| table | rows | newest |');
console.log('|---|---|---|');
for (const r of rows) console.log('| ' + r.name + ' | ' + (r.count < 0 ? '?' : r.count) + ' | ' + (r.last || '—') + ' |');

const empty = rows.filter((r) => r.count === 0).map((r) => r.name);
console.log('\nempty tables (' + empty.length + '): ' + (empty.join(', ') || 'none'));
db.close();
