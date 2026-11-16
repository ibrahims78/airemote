#requires -Version 5.1
# start-gitea.ps1 — تشغيل Gitea الأصلي (لا Docker)
[CmdletBinding()]
param([switch]$Stop, [switch]$Restart)

$root = 'D:\Services\Gitea'
$exe  = Join-Path $root 'gitea.exe'
$pidFile = Join-Path $root 'gitea.pid'
$health = 'http://localhost:3000/api/healthz'

function Test-Gitea {
    try {
        $h = Invoke-WebRequest -Uri $health -TimeoutSec 3 -UseBasicParsing
        return ($h.StatusCode -eq 200)
    } catch { return $false }
}

function Stop-GiteaProc {
    if (Test-Path $pidFile) {
        $old = Get-Content $pidFile -ErrorAction SilentlyContinue
        Get-Process -Id $old -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name 'gitea' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

if ($Stop -or $Restart) {
    Write-Host '[..] إيقاف Gitea'
    Stop-GiteaProc
    Start-Sleep -Seconds 2
    if (-not $Restart) { Write-Host '[OK] موقوف'; return }
}

if (Test-Gitea) {
    Write-Host '[OK] Gitea يعمل أصلاً على http://localhost:3000'
    return
}

if (-not (Test-Path $exe)) { Write-Host '[فشل] gitea.exe مفقود' -ForegroundColor Red; exit 1 }

$p = Start-Process -FilePath $exe -ArgumentList 'web' -WorkingDirectory $root -WindowStyle Hidden -PassThru
Set-Content -Path $pidFile -Value $p.Id
Write-Host "[..] pid=$($p.Id) — انتظار الصحة"
for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Gitea) {
        Write-Host "[OK] Gitea حيّ بعد $(($i+1)*2)s — http://localhost:3000"
        Write-Host '     LAN: http://192.168.1.25:3000 (إن سمحت الجدار)'
        exit 0
    }
}
Write-Host '[فشل] لم يجهز خلال 40 ثانية — راجع logs\' -ForegroundColor Red
exit 1
