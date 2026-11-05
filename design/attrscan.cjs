'use strict'
// Static hygiene scan: invalid markup inside attributes + placeholder i18n coverage.
const fs = require('fs'), path = require('path')
const R = __dirname
let bad = 0
for (const f of ['server.html','windows-agent.html','android.html']) {
  const t = fs.readFileSync(path.join(R, f), 'utf8')
  const inAttr = [...t.matchAll(/(placeholder|title|value)="<span/g)]
  const ph = [...t.matchAll(/<input[^>]*placeholder="([^"]*)"[^>]*>/g)]
  const noEn = ph.filter(m => !/data-ph-en=/.test(m[0]))
  bad += inAttr.length
  console.log(f + ': span-in-attribute=' + inAttr.length + '  inputs-with-placeholder=' + ph.length + '  without-data-ph-en=' + noEn.length)
  for (const m of inAttr) console.log('   BAD: ' + m[0].slice(0, 60))
}
console.log('\nRESULT=' + (bad ? 'FAIL' : 'PASS'))
process.exit(bad ? 1 : 0)
