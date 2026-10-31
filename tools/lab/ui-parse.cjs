const fs = require('fs')
const file = process.argv[2] || 'scratch/ui.xml'
const t = fs.readFileSync(file, 'utf8')
const nodes = t.split('<node ')
for (const n of nodes) {
  const textM = n.match(/text="([^"]*)"/)
  const descM = n.match(/content-desc="([^"]*)"/)
  const b = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
  if (!b) continue
  const label = ((textM && textM[1]) || (descM && descM[1]) || '').trim()
  if (!label) continue
  const cx = Math.round((+b[1] + +b[3]) / 2)
  const cy = Math.round((+b[2] + +b[4]) / 2)
  console.log(label + '  @ ' + cx + ',' + cy)
}
