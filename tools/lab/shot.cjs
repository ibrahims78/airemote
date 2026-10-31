'use strict'
// Capture a Windows lab VM screen through the agent exec channel (no guest credentials).
// usage: node tools/lab/shot.cjs <DEVICE_NAME> <host-out.png>
const path = require('path')
const fs = require('fs')
const remote = require(path.join(__dirname, 'remote.cjs'))

const PS = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
  '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height',
  '$g=[System.Drawing.Graphics]::FromImage($bmp)',
  '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)',
  '$ms=New-Object System.IO.MemoryStream',
  '$bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)',
  '$g.Dispose(); $bmp.Dispose()',
  '[Convert]::ToBase64String($ms.ToArray())',
].join('\r\n')

;(async () => {
  const [device, out] = process.argv.slice(2)
  if (!device || !out) { console.error('usage: node shot.cjs <DEVICE_NAME> <out.png>'); process.exit(1) }
  const r = await remote.run(device, PS, 60000)
  const b64 = String(r.stdout || '').replace(/\s+/g, '')
  if (!b64) { console.error('no image:', String(r.stderr || '').slice(0, 200)); process.exit(2) }
  const buf = Buffer.from(b64, 'base64')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, buf)
  console.log(device + ' -> ' + out + ' (' + buf.length + ' bytes)')
})()
