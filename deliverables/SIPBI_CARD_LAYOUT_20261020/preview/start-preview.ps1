$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$nodeExe=(Get-Command node.exe -ErrorAction Stop).Source
$records=@()
foreach($item in @(@{name='api';file='api-server.mjs';port=55150},@{name='preview';file='preview-server.mjs';port=55154})){
  try { $health=Invoke-RestMethod "http://127.0.0.1:$($item.port)/api/health" -TimeoutSec 2; Write-Output "Already responding on $($item.port)";continue } catch {}
  $scriptFile=Join-Path $taskRoot $item.file
  $process=Start-Process -FilePath $nodeExe -ArgumentList @(('"'+$scriptFile+'"')) -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot ($item.name+'.log')) -RedirectStandardError (Join-Path $taskRoot ($item.name+'.err'))
  $records+=@{pid=$process.Id;startTicks=$process.StartTime.ToUniversalTime().Ticks;script=$scriptFile;port=$item.port}
}
if($records.Count){$records|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskRoot 'preview-state.json') -Encoding utf8}
Write-Output 'BI: http://localhost:55154 (home LAN: use this computer Wi-Fi IPv4 address and port 55154)'
