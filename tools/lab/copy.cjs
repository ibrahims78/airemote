const fs = require('fs')
const [src, dst] = process.argv.slice(2)
fs.copyFileSync(src, dst)
console.log('copied ' + src + ' -> ' + dst + ' (' + fs.statSync(dst).size + ' bytes)')
