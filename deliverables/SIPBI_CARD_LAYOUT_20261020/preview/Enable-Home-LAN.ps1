# Requires administrator rights. Only the user-approved home Wi-Fi and BI port are changed.
$ErrorActionPreference='Stop'
$resultPath=Join-Path $PSScriptRoot '../verification/lan-setup.json'
try {
  $principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
  if(!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Administrator permission is required.'}
  $config=Get-NetIPConfiguration -InterfaceIndex 17
  if($config.InterfaceAlias -ne 'Wi-Fi' -or $config.IPv4DefaultGateway.NextHop -ne '192.168.1.1'){throw 'The approved home Wi-Fi interface or gateway changed. No network settings were changed.'}
  $address=@($config.IPv4Address.IPAddress | Where-Object {$_ -like '192.168.1.*'})[0]
  if(!$address){throw 'The approved home subnet was not found. No network settings were changed.'}
  $nodeAlias=(Get-Command node.exe -ErrorAction Stop).Source
  # Firewall compiles the supplied path literally; nvm's directory junction does not
  # match the canonical application identity recorded for incoming connections.
  $nodeExe=(& $nodeAlias -e "console.log(require('node:fs').realpathSync.native(process.execPath))").Trim()
  if($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $nodeExe -PathType Leaf) -or [IO.Path]::GetFileName($nodeExe) -ne 'node.exe'){throw 'Could not resolve the actual Node executable. No firewall settings were changed.'}
  Set-NetConnectionProfile -InterfaceIndex 17 -NetworkCategory Private
  $ruleName='SIPBI-Card-55154-Private-LocalSubnet'
  $rule=Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if(!$rule){
    New-NetFirewallRule -Name $ruleName -DisplayName 'SIPBI Card Layout TCP 55154 (Home Wi-Fi only)' -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalPort 55154 -Profile Private -RemoteAddress LocalSubnet -InterfaceAlias 'Wi-Fi' -Program $nodeExe -EdgeTraversalPolicy Block | Out-Null
  } else {
    $port=$rule | Get-NetFirewallPortFilter
    $remote=$rule | Get-NetFirewallAddressFilter
    $app=$rule | Get-NetFirewallApplicationFilter
    $iface=$rule | Get-NetFirewallInterfaceFilter
    if([string]$rule.Profile -ne 'Private' -or [string]$port.LocalPort -ne '55154' -or [string]$remote.RemoteAddress -ne 'LocalSubnet' -or $app.Program -notin @($nodeAlias,$nodeExe) -or [string]$iface.InterfaceAlias -ne 'Wi-Fi'){throw 'Existing BI firewall rule differs from the approved narrow scope. Please inspect it.'}
    if($app.Program -ne $nodeExe){
      @{time=[DateTime]::UtcNow.ToString('o');rule=$ruleName;previousProgram=$app.Program;newProgram=$nodeExe;reason='Observed WFP application identity differs from the nvm junction path'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../verification/lan-firewall-path-repair.json') -Encoding utf8
      $app | Set-NetFirewallApplicationFilter -Program $nodeExe | Out-Null
    }
    Enable-NetFirewallRule -Name $ruleName
  }
  @{status='ok';verifiedAt=[DateTime]::UtcNow.ToString('o');interface='Wi-Fi';interfaceIndex=17;networkCategory='Private';address=$address;url="http://${address}:55154/";port=55154;firewallRule=$ruleName;remoteAddress='LocalSubnet';program=$nodeExe} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $resultPath -Encoding utf8
} catch {
  @{status='error';verifiedAt=[DateTime]::UtcNow.ToString('o');message=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
  exit 1
}
