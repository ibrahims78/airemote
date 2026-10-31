Stop-Process -Name 'AiRemote Agent' -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Copy-Item 'C:\Users\admin\new-app.asar' 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar' -Force
'ok' | Set-Content -Path 'C:\Users\admin\swap-result.txt' -Encoding UTF8
