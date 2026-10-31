const fs = require('fs')
const p = process.argv[2]
const fd = fs.openSync(p, 'r')
const head = Buffer.alloc(16)
fs.readSync(fd, head, 0, 16, 0)
const headerSize = head.readUInt32LE(12)
const json = Buffer.alloc(headerSize)
fs.readSync(fd, json, 0, headerSize, 16)
const header = JSON.parse(json.toString('utf8'))
function walk(node, prefix, depth) {
  for (const [name, v] of Object.entries(node.files || {})) {
    const size = v.size != null ? v.size : (v.files ? '' : '?')
    console.log('  '.repeat(depth) + name + (v.files ? '/' : '  ' + size))
    if (v.files && depth < 1) walk(v, prefix + name + '/', depth + 1)
  }
}
console.log('asar ' + p + ' header=' + headerSize + ' bytes')
walk(header, '', 0)
fs.closeSync(fd)
