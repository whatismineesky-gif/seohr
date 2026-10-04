$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
$node = Get-Command node.exe -ErrorAction Stop
$version = [Version] ((& $node.Source --version).Trim().TrimStart('v'))
if ($version -lt [Version]'22.13.0') { throw 'Node.js 22.13.0 or newer is required.' }
if (Get-ScheduledTask -TaskName 'PeopleOS-Web' -ErrorAction SilentlyContinue) { throw 'PeopleOS-Web already exists. Use a separate staging folder for an update.' }
$env:NEXT_TELEMETRY_DISABLED = '1'
& npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Startup task was not installed.' }
Write-Host 'Build succeeded. Next run Configure-VPS.ps1, npm run check:db, then Install-Startup.ps1.'
