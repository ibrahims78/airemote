Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$root = $AE::RootElement
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($w in $all) {
  $name = $w.Current.Name
  $cls = $w.Current.ClassName
  $pid2 = $w.Current.ProcessId
  $pn = ''
  try { $pn = (Get-Process -Id $pid2 -ErrorAction SilentlyContinue).ProcessName } catch {}
  Write-Output ('win=' + $name + ' | class=' + $cls + ' | pid=' + $pid2 + ' | proc=' + $pn)
}
Write-Output ('total=' + $all.Count)
Write-Output '--- agent windows by process enumeration ---'
foreach ($p in (Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)) {
  Write-Output ('proc ' + $p.Id + ' mainwnd=' + $p.MainWindowTitle)
}
