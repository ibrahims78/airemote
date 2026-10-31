$cfg = 'C:\Users\admin\AppData\Roaming\AiRemote Agent\airemote-config.json'
Write-Output ("exists=" + (Test-Path $cfg))
if (Test-Path $cfg) {
  $j = Get-Content $cfg -Raw | ConvertFrom-Json
  Write-Output ("keys=" + (($j.PSObject.Properties.Name) -join ','))
  Write-Output ("controlAuthMode=" + $j.controlAuthMode)
  Write-Output ("hasHash=" + [bool]$j.controlPasswordHash)
  Write-Output ("serverUrl=" + $j.serverUrl)
} else {
  Get-ChildItem 'C:\Users\admin\AppData\Roaming\AiRemote Agent' -ErrorAction SilentlyContinue | Select-Object Name | Format-Table -AutoSize | Out-String
}
