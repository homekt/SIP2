# Run from an elevated Windows PowerShell only if Private LAN access is blocked.
$ErrorActionPreference='Stop'
$name='SIPBI-Sales-5150-Private-LocalSubnet'
$existing=Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
if($existing){Write-Output 'SIPBI Private LAN rule already exists.';exit 0}
New-NetFirewallRule -Name $name -DisplayName 'SIPBI sales demo TCP 5150 (Private LocalSubnet)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5150 -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Output 'Allowed TCP 5150 from LocalSubnet on Private profiles only.'
