Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$out = 'C:\Users\admin\click-result.txt'
"start $(Get-Date -Format o)" | Set-Content -Path $out -Encoding UTF8
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'سماح')
$el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
"found=$([bool]$el)" | Add-Content -Path $out -Encoding UTF8
if ($el) {
  try {
    $p = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $p.Invoke()
    'invoked' | Add-Content -Path $out -Encoding UTF8
  } catch {
    "invoke-err $($_.Exception.Message)" | Add-Content -Path $out -Encoding UTF8
  }
} else {
  # Fallback: list visible top-level windows, then try keyboard on the agent window.
  $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($w in $wins) {
    try { "win: $($w.Current.Name)" | Add-Content -Path $out -Encoding UTF8 } catch {}
  }
  try {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate('AiRemote Agent') | Out-Null
    Start-Sleep -Milliseconds 500
    [System.Windows.Forms.SendKeys]::SendWait('{TAB}{ENTER}')
    'sent-keys' | Add-Content -Path $out -Encoding UTF8
  } catch {
    "keys-err $($_.Exception.Message)" | Add-Content -Path $out -Encoding UTF8
  }
}
"done $(Get-Date -Format o)" | Add-Content -Path $out -Encoding UTF8
