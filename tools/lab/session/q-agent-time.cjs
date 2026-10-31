'use strict'
const remote = require('D:/autoclaw projects-new/AiRemote/tools/lab/remote.cjs')
const CMD = "(Get-Item 'C:\\Users\\admin\\AppData\\Local\\Programs\\AiRemote Agent\\AiRemote Agent.exe').LastWriteTime.ToString('yyyy-MM-dd HH:mm')"
;(async () => {
  for (const vm of ['WIN10-VM', 'WIN11-VM']) {
    const r = await remote.run(vm, CMD)
    console.log(vm, r.status, r.stdout || r.stderr)
  }
})()
