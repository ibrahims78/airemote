# bench-gdi.ps1 - in-guest A/B: precompiled worker (.exe) vs PowerShell Add-Type worker (.ps1).
# Measures spawn -> first JPEG bytes on stdout. Keeps stdin OPEN (like the real agent does),
# otherwise the worker sees EOF right after 'A' and exits before the first frame.
# Output: C:\Users\admin\bench-gdi.out.txt  (ASCII only: PS 5.1 reads UTF-8 as ANSI)
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\bench-gdi.out.txt'
$lines = New-Object System.Collections.ArrayList
$dir = Join-Path $env:APPDATA 'AiRemote Agent'
$ps1 = Join-Path $dir 'capture-gdi.ps1'
$exe = (Get-ChildItem $dir -Filter 'capture-gdi-worker-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName

function Add-Line($s) { [void]$lines.Add($s) }

Add-Line ('WORKER_EXE=' + $exe)
Add-Line ('EXE_EXISTS=' + (Test-Path $exe))
Add-Line ('PS1_EXISTS=' + (Test-Path $ps1))

function Measure-One([string]$kind, [int]$idx) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($kind -eq 'exe') {
        $psi.FileName = $exe
        $psi.Arguments = '-Fps 12 -Quality 60 -MaxWidth 1600'
    } else {
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $ps1 + '" -Fps 12 -Quality 60 -MaxWidth 1600'
    }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $p = $null
    $ms = -1
    $bytes = -1
    try {
        $p = [System.Diagnostics.Process]::Start($psi)
    } catch {
        Add-Line ("$kind#$idx START_ERROR " + $_.Exception.Message)
        return
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $p.StandardInput.WriteLine('A')
    $p.StandardInput.Flush()

    $buf = New-Object byte[] 262144
    $total = 0
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    $stream = $p.StandardOutput.BaseStream
    while ([DateTime]::UtcNow -lt $deadline) {
        $ar = $stream.BeginRead($buf, 0, $buf.Length, $null, $null)
        if (-not $ar.AsyncWaitHandle.WaitOne(25000)) { break }
        $n = 0
        try { $n = $stream.EndRead($ar) } catch { break }
        if ($n -le 0) { break }
        $total += $n
        if ($total -ge 1000 -and $ms -lt 0) { $ms = $sw.ElapsedMilliseconds }
        if ($total -ge 2000) { break }
    }
    $bytes = $total
    Add-Line ("$kind#$idx first_bytes_ms=" + $ms + " bytes=" + $bytes + " exited=" + $p.HasExited)
    try { $p.StandardInput.Close() } catch {}
    try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
    try { & taskkill.exe /T /F /PID $p.Id 2>$null | Out-Null } catch {}
    Start-Sleep -Milliseconds 900
}

Measure-One 'exe' 1
Measure-One 'ps1' 1
Measure-One 'exe' 2
Measure-One 'ps1' 2
Measure-One 'exe' 3

Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
