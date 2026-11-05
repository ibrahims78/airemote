/**
 * audit-inventory.cjs — independent re-check of design/INVENTORY.csv.
 * Does NOT reuse the scanner's parsing: it re-reads the source block at the
 * recorded line and checks that the recorded label and handler really exist.
 */
const fs = require('fs')
const path = require('path')
const ROOT = 'D:/autoclaw projects-new/AiRemote'

const csvPath = path.join(ROOT, 'design/INVENTORY.csv')
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean)

function parse (l) {
  const out = []; let cur = ''; let q = false
  for (let i = 0; i < l.length; i++) {
    const ch = l[i]
    if (q) {
      if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const head = parse(lines[0])
const rows = lines.slice(1).map(l => { const c = parse(l); const o = {}; head.forEach((h, i) => { o[h] = c[i] }); return o })

const dictAr = {}
const re = /(?:^|[\s,{])([A-Za-z_][\w]*)\s*:\s*(['"])((?:\\.|(?!\2)[\s\S])*?)\2/g
{
  const s = fs.readFileSync(path.join(ROOT, 'packages/dashboard/src/lib/i18n.ts'), 'utf8')
  const a = s.indexOf('ar: {'); const e = s.indexOf('en: {')
  const slice = s.slice(a, e); let m
  while ((m = re.exec(slice))) dictAr[m[1]] = m[3]
}
const agentSrc = fs.readFileSync(path.join(ROOT, 'packages/agent-desktop/renderer/app.js'), 'utf8')
{
  re.lastIndex = 0
  const i = agentSrc.indexOf('const LANG = {'); const a = agentSrc.indexOf('ar: {', i); const e = agentSrc.indexOf('en: {', a)
  const slice = agentSrc.slice(a, e); let m
  while ((m = re.exec(slice))) dictAr[m[1]] = m[3]
}

function block (abs, line) {
  const arr = fs.readFileSync(abs, 'utf8').split(/\r?\n/)
  let out = ''
  for (let i = line - 1; i < Math.min(arr.length, line + 30); i++) {
    out += arr[i] + '\n'
    if (/\/>|<\/[A-Za-z]|>\s*$/.test(arr[i]) && i > line - 1) break
  }
  return out
}

const sample = []
for (let i = 1; i < rows.length; i += 11) sample.push(rows[i])

let ok = 0
const findings = []
for (const r of sample) {
  const abs = path.join(ROOT, r.file)
  const b = block(abs, Number(r.line))
  const src = fs.readFileSync(abs, 'utf8')
  const problems = []

  const label = r.label || ''
  const skipLabel = /^\(أيقونة/.test(label) || label === '(بلا نص)' || /^\(حقل:/.test(label) || /derived:/.test(r.notes)
  if (!skipLabel) {
    const key = (r.notes.match(/i18n:([\w]+)/) || [])[1]
    const fromDict = key && dictAr[key] === label
    const literal = b.includes(label)
    const stripped = label.replace(/\{[^}]*\}/g, '').trim()
    if (!fromDict && !literal && !(stripped && b.includes(stripped))) problems.push('LABEL: "' + label.slice(0, 40) + '" not in element block')
  }

  if (r.action && /^\w[\w.]*\(\)$/.test(r.action)) {
    const fn = r.action.replace(/\(\)$/, '').split('.').pop()
    const callRe = new RegExp(fn + '\\s*\\(')
    const bareRe = new RegExp('\\b' + fn + '\\b')
    const extra = r.surface === 'windows-agent' ? agentSrc : ''
    if (!callRe.test(src) && !callRe.test(extra) && !bareRe.test(src)) problems.push('ACTION: ' + fn + '() not found in file')
  }

  if (problems.length) findings.push({ at: r.file + ':' + r.line, id: r.id, problems })
  else ok++
}

console.log('SAMPLE=' + sample.length + ' OK=' + ok + ' FAIL=' + findings.length)
for (const f of findings.slice(0, 20)) console.log(' - ' + f.at + ' [' + f.id + '] ' + f.problems.join(' | '))
