$dirs = @(
  "$env:APPDATA\AiRemote Agent",
  "$env:APPDATA\airemote-agent-desktop",
  "$env:LOCALAPPDATA\AiRemote Agent"
)
foreach ($d in $dirs) {
  if (Test-Path $d) {
    "DIR $d"
    Get-ChildItem $d -Force | Select-Object -First 12 | ForEach-Object { "  " + $_.Name + " " + $_.Length }
    Get-ChildItem $d -Recurse -Include '*.log','*.json' -ErrorAction SilentlyContinue | Select-Object -First 6 | ForEach-Object { "  FILE " + $_.FullName + " " + $_.Length }
  }
}
$log = Get-ChildItem "$env:APPDATA\AiRemote Agent" -Recurse -Include '*.log' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($log) {
  "---- tail $($log.FullName)"
  Get-Content $log.FullName -Tail 25 -Encoding UTF8
} else { "no log file" }
