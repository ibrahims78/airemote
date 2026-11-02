$ErrorActionPreference = 'Stop'
$ks = 'C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks'
$pwFile = 'C:\Users\admin\AppData\Roaming\AiRemote\signing\keystore-password.txt'
$keytool = 'D:\autoclaw projects\offline-build-tools\android-toolchain\jdk\bin\keytool.exe'

$lines = @(Get-Content $pwFile | Where-Object { $_.Trim().Length -gt 0 })
$ok = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  $cand = $lines[$i].Trim()
  # جرّب السطر كما هو، وأيضاً ما بعد '=' إن وُجد
  foreach ($c in @($cand, ($cand -split '=', 2)[-1].Trim())) {
    if (-not $c) { continue }
    $out = & $keytool -list -keystore $ks -storepass $c 2>&1
    if ($LASTEXITCODE -eq 0) { $ok = $i; break }
  }
  if ($ok -ge 0) { break }
}
if ($ok -lt 0) { 'NO_MATCHING_LINE'; exit 1 }
"password_line_index=$ok (0-based)  lines=$($lines.Count)"
# اكتب السطر الصحيح إلى ملف مؤقت يستخدمه apksigner عبر --ks-pass file:
$tmp = Join-Path $env:TEMP 'ar-ks-pass.txt'
[System.IO.File]::WriteAllText($tmp, $lines[$ok].Trim(), (New-Object System.Text.UTF8Encoding($false)))
"temp_pass_file=$tmp"
