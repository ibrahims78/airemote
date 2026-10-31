'use strict'
// Dump UIA control names/types for AiRemote windows on a lab VM.
// usage: node tools/lab/uia-dump.cjs <DEVICE_NAME> [maxLines]
const path = require('path')
const remote = require(path.join(__dirname, 'remote.cjs'))

const PS = [
  'Add-Type -AssemblyName UIAutomationClient',
  'Add-Type -AssemblyName UIAutomationTypes',
  '$root=[System.Windows.Automation.AutomationElement]::RootElement',
  '$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)',
  'foreach($w in $wins){',
  '  try {',
  '    $n=$w.Current.Name',
  "    if($n -notmatch 'AiRemote|airemote'){ continue }",
  '    "WINDOW: $n"',
  '    $all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)',
  '    foreach($e in $all){',
  '      try { $c=$e.Current.ControlType.ProgrammaticName -replace "ControlType.",""; $nm=$e.Current.Name; if($nm){ "$c|$nm" } } catch {}',
  '    }',
  '  } catch {}',
  '}',
].join('\r\n')

;(async () => {
  const device = process.argv[2]
  const max = parseInt(process.argv[3] || '80', 10)
  if (!device) { console.error('usage: node uia-dump.cjs <DEVICE_NAME> [maxLines]'); process.exit(1) }
  const r = await remote.run(device, PS, 60000)
  const lines = String(r.stdout || '').split(/\r?\n/).filter(Boolean)
  console.log(lines.slice(0, max).join('\n'))
  if (lines.length > max) console.log('… +' + (lines.length - max) + ' more')
})()
