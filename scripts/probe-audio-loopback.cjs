const { app, BrowserWindow, desktopCapturer } = require('electron')
const path = require('path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 400, height: 300, webPreferences: { nodeIntegration: false, contextIsolation: true } })
  win.webContents.session.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then(s => cb({ video: s[0], audio: 'loopback' }))
      .catch(() => cb({}))
  })
  await win.loadFile(path.join(__dirname, 'probe.html'))
  const r = await win.webContents.executeJavaScript('window.__probe()')
  console.log('RESULT ' + JSON.stringify(r))
  app.exit(0)
})
