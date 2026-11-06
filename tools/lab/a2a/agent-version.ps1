# agent-version.ps1 - read the REAL application version out of app.asar (no node needed in the guest).
# Output: C:\Users\admin\agent-version.out.txt (output name = script name - lab rule).
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\admin\agent-version.out.txt'
$lines = New-Object System.Collections.ArrayList

function Read-AsarVersion([string]$asar) {
    $fs = [IO.File]::OpenRead($asar)
    try {
        $br = New-Object IO.BinaryReader($fs)
        $null = $br.ReadUInt32()                 # 4 - first pickle word
        $headerSize = $br.ReadUInt32()           # size of the header pickle
        $strLen = $br.ReadUInt32()               # length of the JSON string
        $jsonBytes = $br.ReadBytes([int]$strLen)
        $raw = [Text.Encoding]::UTF8.GetString($jsonBytes)
        $i0 = $raw.IndexOf('{')
        $i1 = $raw.LastIndexOf('}')
        if ($i0 -lt 0 -or $i1 -le $i0) { throw 'asar header does not look like JSON' }
        $hdr = $raw.Substring($i0, $i1 - $i0 + 1) | ConvertFrom-Json
        $node = $hdr.files.PSObject.Properties['package.json'].Value
        if (-not $node) { throw 'package.json not present in asar header' }
        $dataStart = [int64]8 + [int64]$headerSize
        $fs.Position = $dataStart + [int64]$node.offset
        $buf = New-Object byte[] ([int]$node.size)
        $read = $fs.Read($buf, 0, $buf.Length)
        $txt = [Text.Encoding]::UTF8.GetString($buf, 0, $read)
        $m = [regex]::Match($txt, '"version"\s*:\s*"([^"]+)"')
        if (-not $m.Success) { throw 'version field not found in package.json' }
        return $m.Groups[1].Value
    } finally { $fs.Dispose() }
}

try {
    $exe     = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
    $asar    = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar'
    $dataDir = 'C:\Users\admin\AppData\Roaming\AiRemote Agent'

    [void]$lines.Add('COMP=' + $env:COMPUTERNAME)
    [void]$lines.Add('EXE_EXISTS=' + (Test-Path $exe))
    if (Test-Path $exe) {
        [void]$lines.Add('EXE_VERSION=' + (Get-Item $exe).VersionInfo.ProductVersion)
        [void]$lines.Add('EXE_MTIME=' + (Get-Item $exe).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
    }
    [void]$lines.Add('ASAR_EXISTS=' + (Test-Path $asar))
    if (Test-Path $asar) {
        $fi = Get-Item $asar
        [void]$lines.Add('ASAR_SIZE=' + $fi.Length)
        [void]$lines.Add('ASAR_MTIME=' + $fi.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
        [void]$lines.Add('VERSION=' + (Read-AsarVersion $asar))
    }
    $procs = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
    [void]$lines.Add('RUNNING=' + $procs.Count)
    foreach ($p in $procs) { [void]$lines.Add('PROC_PID=' + $p.Id + ' START=' + $p.StartTime.ToString('HH:mm:ss')) }
    $workers = @(Get-Process -Name 'capture-gdi-worker*' -ErrorAction SilentlyContinue)
    [void]$lines.Add('WORKER_PROCS=' + $workers.Count)
    foreach ($w in $workers) { [void]$lines.Add('WORKER_PID=' + $w.Id + ' NAME=' + $w.ProcessName) }
    [void]$lines.Add('DATA_EXISTS=' + (Test-Path $dataDir))
    if (Test-Path $dataDir) {
        $cfg = Join-Path $dataDir 'config.json'
        if (Test-Path $cfg) { [void]$lines.Add('CONFIG_SIZE=' + (Get-Item $cfg).Length) }
    }
    [void]$lines.Add('RESULT=ok')
} catch {
    [void]$lines.Add('RESULT=ERR ' + $_.Exception.Message)
    [void]$lines.Add('ERR_AT=' + $_.InvocationInfo.ScriptLineNumber)
}
$lines | Set-Content -Encoding UTF8 $log
