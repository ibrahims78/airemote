# build-server.ps1 — بناء اللوحة ثم حزمة السيرفر ثم المثبّت (بلا تنزيل cloudflared).
$ErrorActionPreference = 'Continue'   # تحذيرات stderr (vite/browserslist) ليست فشلاً؛ الحكم على $LASTEXITCODE
$repo = 'D:\autoclaw projects-new\AiRemote'
$log  = Join-Path $repo 'outputs\verify-2026-11-01\p5-build\server-build.log'
function Say($m) { $m | Tee-Object -FilePath $log -Append }

Push-Location $repo
try {
  Say '=== dashboard build ==='
  & pnpm --filter '@airemote/shared' build 2>&1 | Tee-Object -FilePath $log -Append | Select-Object -Last 2
  if ($LASTEXITCODE -ne 0) { throw "shared build failed ($LASTEXITCODE)" }
  & pnpm --filter '@airemote/dashboard' build 2>&1 | Tee-Object -FilePath $log -Append | Select-Object -Last 3
  if ($LASTEXITCODE -ne 0) { throw "dashboard build failed ($LASTEXITCODE)" }

  Say '=== copy dashboard into server ==='
  & node 'packages/server-desktop/scripts/copy-dashboard.js' 2>&1 | Tee-Object -FilePath $log -Append | Select-Object -Last 2
  if ($LASTEXITCODE -ne 0) { throw "copy-dashboard failed ($LASTEXITCODE)" }

  Say '=== bundle server ==='
  Push-Location (Join-Path $repo 'packages\server-desktop')
  try {
    & node 'scripts/bundle.js' 2>&1 | Tee-Object -FilePath $log -Append | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { throw "bundle failed ($LASTEXITCODE)" }

    Say '=== electron-builder (server) ==='
    & '.\node_modules\.bin\electron-builder.cmd' --win --x64 2>&1 | Tee-Object -FilePath $log -Append | Select-Object -Last 6
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed ($LASTEXITCODE)" }
  } finally { Pop-Location }
  Say 'SERVER_BUILD_OK'
} catch {
  Say ("SERVER_BUILD_FAILED " + $_.Exception.Message)
  throw
} finally { Pop-Location }
