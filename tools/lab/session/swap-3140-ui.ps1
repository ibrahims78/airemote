# swap-3140-ui.ps1 - install the fixed 3.14.0 renderer (bridge-shadow hotfix) into the guest agent.
# Keeps the guest's own config, so the agent reconnects to its real server.
# Output: C:\Users\admin\swap-3140-ui.out.txt (output name = script name - lab rule).
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\admin\swap-3140-ui.out.txt'
$lines = New-Object System.Collections.ArrayList

function Read-AsarVersion([string]$asar) {
    $fs = [IO.File]::OpenRead($asar)
    try {
        $br = New-Object IO.BinaryReader($fs)
        $null = $br.ReadUInt32()
        $headerSize = $br.ReadUInt32()
        $strLen = $br.ReadUInt32()
        $jsonBytes = $br.ReadBytes([int]$strLen)
        $raw = [Text.Encoding]::UTF8.GetString($jsonBytes)
        $i0 = $raw.IndexOf('{'); $i1 = $raw.LastIndexOf('}')
        if ($i0 -lt 0 -or $i1 -le $i0) { throw 'asar header is not JSON' }
        $hdr = $raw.Substring($i0, $i1 - $i0 + 1) | ConvertFrom-Json
        $node = $hdr.files.PSObject.Properties['package.json'].Value
        if (-not $node) { throw 'package.json missing from asar header' }
        $fs.Position = ([int64]8 + [int64]$headerSize) + [int64]$node.offset
        $buf = New-Object byte[] ([int]$node.size)
        $read = $fs.Read($buf, 0, $buf.Length)
        $txt = [Text.Encoding]::UTF8.GetString($buf, 0, $read)
        $m = [regex]::Match($txt, '"version"\s*:\s*"([^"]+)"')
        if (-not $m.Success) { throw 'version not found' }
        return $m.Groups[1].Value
    } finally { $fs.Dispose() }
}

try {
    $exe     = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
    $target  = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar'
    $src     = 'C:\Users\admin\new-app.asar'
    if (-not (Test-Path $src)) { throw "source asar missing: $src" }

    [void]$lines.Add('COMP=' + $env:COMPUTERNAME)
    [void]$lines.Add('OLD_VERSION=' + (Read-AsarVersion $target))
    $srcSize = (Get-Item $src).Length
    [void]$lines.Add('SRC_SIZE=' + $srcSize)
    [void]$lines.Add('SRC_VERSION=' + (Read-AsarVersion $src))

    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = $target + '.bak-' + $stamp
    Copy-Item $target $backup -Force
    [void]$lines.Add('BACKUP=' + (Split-Path $backup -Leaf))

    Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Copy-Item $src $target -Force
    $dstSize = (Get-Item $target).Length
    [void]$lines.Add('TARGET_SIZE=' + $dstSize)
    [void]$lines.Add('SIZE_MATCH=' + ($srcSize -eq $dstSize))
    [void]$lines.Add('NEW_VERSION=' + (Read-AsarVersion $target))

    Start-Process $exe
    Start-Sleep -Seconds 14

    [void]$lines.Add('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
    $workers = @(Get-Process -Name 'capture-gdi-worker*' -ErrorAction SilentlyContinue)
    [void]$lines.Add('WORKER_PROCS=' + $workers.Count)
    $titled = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle })
    [void]$lines.Add('WINDOWS=' + $titled.Count)
    foreach ($p in $titled) { [void]$lines.Add('TITLE=' + $p.MainWindowTitle) }
    [void]$lines.Add('RESULT=ok')
} catch {
    [void]$lines.Add('RESULT=ERR ' + $_.Exception.Message)
}
$lines | Set-Content -Encoding UTF8 $log
