// Minimal static server for packages/dashboard/dist with SPA fallback (pre-deploy layout checks).
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = 'D:\\autoclaw projects-new\\AiRemote\\packages\\dashboard\\dist'
const PORT = Number(process.env.PORT || 4173)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html')
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, '127.0.0.1', () => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT))
