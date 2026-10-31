'use strict'
const remote = require('D:/autoclaw projects-new/AiRemote/tools/lab/remote.cjs')
;(async () => {
  const r = await remote.run('WIN11-VM', "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $_.Bounds.Width.ToString() + 'x' + $_.Bounds.Height.ToString() }")
  console.log(JSON.stringify(r))
})()
