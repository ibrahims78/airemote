# ينقر «السماح / Allow» في حوار طلب التحكم إن ظهر
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline = (Get-Date).AddSeconds(25)
$clicked = $false
while ((Get-Date) -lt $deadline -and -not $clicked) {
  Start-Sleep -Milliseconds 400
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'طلب التحكم / Remote Control Request')
  $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
  if (-not $win) {
    $cond2 = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, 'Remote Control Request')
    $win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond2)
  }
  if ($win) {
    Write-Host "FOUND $($win.Current.Name)"
    $btnCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
    $btns = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
    foreach ($b in $btns) {
      Write-Host "BTN $($b.Current.Name)"
      if ($b.Current.Name -match 'Allow|سماح') {
        $inv = $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $inv.Invoke()
        Write-Host 'CLICKED ALLOW'
        $clicked = $true
        break
      }
    }
    if (-not $clicked -and $btns.Count -gt 0) {
      # أول زر هو Allow حسب الكود
      $inv = $btns[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $inv.Invoke()
      Write-Host 'CLICKED FIRST BTN'
      $clicked = $true
    }
  }
}
if ($clicked) { Write-Host OK } else { Write-Host 'NO DIALOG' }
