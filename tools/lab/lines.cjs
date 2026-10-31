// print lines [from, to] (1-based) of a file, plus optional context grep
const fs = require('fs')
const file = process.argv[2]
const from = parseInt(process.argv[3] || '1', 10)
const to = parseInt(process.argv[4] || String(from), 10)
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
for (let i = from; i <= Math.min(to, lines.length); i++) console.log(String(i).padStart(6) + ' | ' + lines[i - 1])
