# sign-apk2.ps1 — توقيع APK بتمرير الكلمة مباشرة (لا تُطبع).
$ErrorActionPreference = 'Stop'
$repo = 'D:\autoclaw projects-new\AiRemote'
$ks   = 'C:\Users\admin\AppData\Roaming\AiRemote\signing\airemote-release.jks'
$bt   = 'D:\autoclaw projects\offline-build-tools\android-toolchain\sdk\build-tools\34.0.0'
$jdk  = 'D:\autoclaw projects\offline-build-tools\android-toolchain\jdk'
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"
$pw = (Get-Content (Join-Path $env:TEMP 'ar-ks-pass.txt') -Raw).Trim()

# 1) تأكيد أن الكلمة تفتح المخزن، وطبع الأسماء (بلا كلمات مرور)
$aliases = & (Join-Path $jdk 'bin\keytool.exe') -list -keystore $ks -storepass $pw 2>&1
if ($LASTEXITCODE -ne 0) { throw "keytool rejected the password" }
$aliasLine = ($aliases | Select-String -Pattern 'PrivateKeyEntry' | Select-Object -First 1).Line
"alias_line=$($aliasLine.Trim())"

$ver = (Get-Content (Join-Path $repo 'VERSION') -Raw).Trim()
$unsigned = Join-Path $repo 'packages\android-agent\app\build\outputs\apk\release\app-release-unsigned.apk'
$outDir = Join-Path $repo 'releases\android-agent'
$aligned = Join-Path $outDir 'app-release-aligned.apk'
$signed  = Join-Path $outDir "AiRemote-Agent-Android-v$ver.apk"

& (Join-Path $bt 'zipalign.exe') -f -p 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

& (Join-Path $bt 'apksigner.bat') sign --ks $ks --ks-pass "pass:$pw" --key-pass "pass:$pw" --out $signed $aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner sign failed' }

$verify = & (Join-Path $bt 'apksigner.bat') verify --verbose $signed 2>&1
"verify_first=$((($verify | Select-Object -First 1) -as [string]).Trim())"
"signed_apk=$signed bytes=$((Get-Item $signed).Length)"
Remove-Item $aligned -Force -ErrorAction SilentlyContinue
