<#
.SYNOPSIS
  Re-establishes the Android agent link: adb server -> emulator -> adb reverse -> bridge -> server.

.DESCRIPTION
  The Android agent reaches the server through 127.0.0.1:3101, which is forwarded
  into the emulator with `adb reverse` and relayed to the server by
  %APPDATA%\AiRemote\android-bridge.py. If the emulator's adb connection drops
  (shown as "offline" in `adb devices`), the reverse tunnel disappears and the
  agent silently stops connecting. This script repairs all three hops and
  restarts the agent app.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\restore-android-tunnel.ps1
#>
param(
  [string]$AdbPath  = 'D:\LDPlayer\LDPlayer9\adb.exe',
  [string]$Serial   = '127.0.0.1:5555',
  [int]   $Port     = 3101,
  [string]$Package  = 'com.airemote.agent',
  [string]$Activity = 'com.airemote.agent/.MainActivity'
)

$ErrorActionPreference = 'Continue'

function Step($text) { Write-Host "[android] $text" }

if (-not (Test-Path $AdbPath)) {
  Write-Error "adb not found at $AdbPath - pass -AdbPath"
}

Step "restarting adb server"
& $AdbPath kill-server   2>&1 | Out-Null
Start-Sleep -Milliseconds 800
& $AdbPath start-server  2>&1 | Out-Null
Start-Sleep -Seconds 2

Step "connecting $Serial"
& $AdbPath connect $Serial | Out-Null
Start-Sleep -Seconds 2

# Wait until the serial reports "device" instead of "offline"/"unauthorized".
$deadline = (Get-Date).AddSeconds(45)
do {
  $state = (& $AdbPath devices) | Select-String -Pattern ([regex]::Escape($Serial) + '\s+(\w+)')
  if ($state -and $state.Matches[0].Groups[1].Value -eq 'device') { break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if (-not $state -or $state.Matches[0].Groups[1].Value -ne 'device') {
  Write-Error "emulator did not come online: $state"
}
Step "device online: $Serial"

Step "re-creating reverse tunnel tcp:$Port"
& $AdbPath -s $Serial reverse --remove-all 2>&1 | Out-Null
& $AdbPath -s $Serial reverse ("tcp:{0}" -f $Port) ("tcp:{0}" -f $Port) | Out-Null
$rev = (& $AdbPath -s $Serial reverse --list) -join ' '
Step "reverse list: $rev"

Step "restarting $Package"
& $AdbPath -s $Serial shell am force-stop $Package | Out-Null
Start-Sleep -Milliseconds 600
& $AdbPath -s $Serial shell am start -n $Activity | Out-Null
Start-Sleep -Seconds 3
$pid = (& $AdbPath -s $Serial shell pidof $Package) -join ''
Step "agent pid: $pid"

Step "done. If the device still shows offline in the dashboard, check that"
Step "  1) android-bridge.py is running and listening on 127.0.0.1:$Port,"
Step "  2) the server is reachable at the bridge target (see the script header)."
