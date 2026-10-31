param([int]$Seconds = 45)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$root = $AE::RootElement
$deadline = (Get-Date).AddSeconds($Seconds)
$clicked = $false
$seen = @()
while ((Get-Date) -lt $deadline -and -not $clicked) {
  foreach ($p in (Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)) {
    try {
      $pcond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $p.Id)
      $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $pcond)
      foreach ($w in $wins) {
        $bcond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
        $buttons = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $bcond)
        foreach ($b in $buttons) {
          $name = $b.Current.Name
          if ($name -and $seen -notcontains $name) { $seen += $name }
          if ($name -match 'Allow' -or $name -match 'سماح') {
            $pat = $null
            if ($b.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pat)) {
              $pat.Invoke()
              Write-Output ('clicked=' + $name)
              $clicked = $true
            }
          }
        }
      }
    } catch { }
  }
  if (-not $clicked) { Start-Sleep -Milliseconds 400 }
}
Write-Output ('done clicked=' + $clicked)
Write-Output ('buttons=' + ($seen -join '|'))
exit 0
