#requires -Version 5.1
# start-gitea.ps1 - start/stop native Gitea (no Docker)
[CmdletBinding()]
param(
    [switch]$Stop,
    [switch]$Restart
)

$root    = 'D:\Services\Gitea'
$exe     = Join-Path $root 'gitea.exe'
$pidFile = Join-Path $root 'gitea.pid'
$health  = 'http://localhost:3000/api/healthz'

function Test-Gitea {
    try {
        $h = Invoke-WebRequest -Uri $health -TimeoutSec 3 -UseBasicParsing
        return ($h.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Stop-GiteaProc {
    if (Test-Path $pidFile) {
        $old = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($old) {
            Get-Process -Id $old -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    Get-Process -Name 'gitea' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    # fallback: kill by path
    Get-Process | Where-Object { $_.Path -like 'D:\Services\Gitea\gitea.exe' } | Stop-Process -Force -ErrorAction SilentlyContinue
}

if ($Stop) {
    Write-Host '[..] stopping Gitea'
    Stop-GiteaProc
    Start-Sleep -Seconds 2
    if (Test-Gitea) {
        Write-Host '[FAIL] still responding' 
        exit 1
    }
    Write-Host '[OK] stopped'
    exit 0
}

if ($Restart) {
    Write-Host '[..] restarting Gitea'
    Stop-GiteaProc
    Start-Sleep -Seconds 2
}

if (Test-Gitea) {
    Write-Host '[OK] Gitea already running on http://localhost:3000'
    exit 0
}

if (-not (Test-Path $exe)) {
    Write-Host '[FAIL] gitea.exe missing'
    exit 1
}

$p = Start-Process -FilePath $exe -ArgumentList 'web' -WorkingDirectory $root -WindowStyle Hidden -PassThru
Set-Content -Path $pidFile -Value $p.Id
Write-Host "[..] pid=$($p.Id) waiting for health"
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Gitea) {
        Write-Host "[OK] Gitea healthy after $(($i+1)*2)s - http://localhost:3000"
        Write-Host '     LAN: http://192.168.1.25:3000'
        exit 0
    }
}
Write-Host '[FAIL] not healthy after 40s - check logs'
exit 1
