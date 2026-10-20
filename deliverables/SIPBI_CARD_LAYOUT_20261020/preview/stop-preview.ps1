$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$stateFile=Join-Path $taskRoot 'preview-state.json'
if(!(Test-Path -LiteralPath $stateFile)){Write-Output 'No preview process record.';exit}
$expectedNode=(Get-Command node.exe -ErrorAction Stop).Source
foreach($record in @(Get-Content -LiteralPath $stateFile -Raw|ConvertFrom-Json)){
  $process=Get-Process -Id $record.pid -ErrorAction SilentlyContinue
  if($process -and $process.StartTime.ToUniversalTime().Ticks -eq [long]$record.startTicks -and $process.Path -eq $expectedNode){Stop-Process -Id $process.Id;Write-Output "Stopped preview process $($process.Id) on $($record.port)"}
}
