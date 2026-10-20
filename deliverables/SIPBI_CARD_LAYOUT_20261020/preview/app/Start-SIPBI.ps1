param([int]$Port=5150)
$ErrorActionPreference='Stop'
if($Port -ne 5150){throw 'This delivery is configured for port 5150.'}
$root=$PSScriptRoot
$state=Join-Path $root 'runtime'
New-Item -ItemType Directory -Force $state | Out-Null
$pidFile=Join-Path $state 'server.json'
if(Test-Path $pidFile){
 $record=Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
 $existing=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
 if($existing -and $existing.StartTime.ToUniversalTime().Ticks -eq [long]$record.startTicks){Write-Output "SIPBI already running: http://localhost:$Port";exit 0}
}
try {$health=Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2;throw "Port $Port is occupied. Existing service was left running."} catch {if($_.Exception.Message -like '*occupied*'){throw}}
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(!(Test-Path (Join-Path $root 'frontend/dist/index.html'))){throw 'Build missing. Run npm ci and npm run build in frontend first.'}
$env:PORT=[string]$Port
$env:HOST='0.0.0.0'
$server=Join-Path $root 'scripts/sales-server.mjs'
$process=Start-Process -FilePath $node -ArgumentList @(('"'+$server+'"')) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $state 'server.log') -RedirectStandardError (Join-Path $state 'server.err')
[pscustomobject]@{pid=$process.Id;startTicks=$process.StartTime.ToUniversalTime().Ticks;node=$node;script=$server;port=$Port} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
$ready=$false
for($attempt=0;$attempt -lt 30;$attempt++){
 Start-Sleep -Milliseconds 500
 if($process.HasExited){throw "Server exited. See $state/server.err"}
 try { $health=Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2; $ready=$true;break } catch {}
}
if(!$ready){throw 'Process started but health did not respond. Inspect runtime logs.'}
Write-Output "SIPBI: http://localhost:$Port"
Write-Output 'Synthetic shared demo; no login or company permission enforcement.'
