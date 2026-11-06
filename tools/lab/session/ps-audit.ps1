$o = New-Object System.Collections.ArrayList
$ps = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue
[void]$o.Add('PS_COUNT=' + @($ps).Count)
foreach ($p in $ps) {
  $par = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.ParentProcessId) -ErrorAction SilentlyContinue)
  $pp = if ($par) { $par.Name } else { '?' }
  $w = @(Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count
  $cl = ($p.CommandLine -replace "\s+", ' ')
  if ($cl.Length -gt 150) { $cl = $cl.Substring(0, 150) }
  [void]$o.Add('PS pid=' + $p.ProcessId + ' parent=' + $pp + '(' + $p.ParentProcessId + ') win=' + $w + ' cmd=' + $cl)
}
[void]$o.Add('AGENT_COUNT=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
$o | Set-Content -Encoding UTF8 'C:\Users\admin\ps-audit.out.txt'
