$ErrorActionPreference='Stop'
$pidFile=Join-Path $PSScriptRoot 'runtime/server.json'
if(!(Test-Path $pidFile)){Write-Output 'No SIPBI process record.';exit 0}
$record=Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$process=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
if(!$process){Write-Output 'Recorded process has already exited.';exit 0}
if($process.StartTime.ToUniversalTime().Ticks -ne [long]$record.startTicks){throw 'PID has been reused. Refusing to stop an unrelated process.'}
if($process.ProcessName -ne 'node'){throw 'Recorded process is not Node. Refusing to stop it.'}
Stop-Process -Id $process.Id
Write-Output 'Stopped this SIPBI server only.'
