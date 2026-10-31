Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$names = @('السماح / Allow', 'السماح', 'Allow')
$done = $false
foreach ($n in $names) {
  if ($done) { break }
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $n)
  $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($el) {
    try {
      $p = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $p.Invoke()
      "invoked: $n"
      $done = $true
    } catch { "invoke-failed: $n ($($_.Exception.Message))" }
  }
}
if (-not $done) {
  # dump top-level window names to see what is actually there
  $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($w in $wins) { try { "win: $($w.Current.Name)" } catch {} }
  'not-found'
}
