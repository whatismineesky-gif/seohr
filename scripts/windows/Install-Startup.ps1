$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$admin = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as Administrator.' }
if (-not (Test-Path (Join-Path $root '.next/BUILD_ID'))) { throw 'Run npm run build first.' }
if (-not (Test-Path (Join-Path $root 'config/runtime.json'))) { throw 'Run Configure-VPS.ps1 first.' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$taskName = 'PeopleOS-Web'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'PeopleOS-Web already exists. Do not install twice.' }
Set-Location $root
& $node 'scripts/check-vps-db.mjs'
if ($LASTEXITCODE -ne 0) { throw 'Database check failed; task was not installed.' }
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
& icacls.exe $logs /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' /T | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot protect log directory.' }
& icacls.exe $root /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot grant application read access.' }
$cache = Join-Path $root '.next/cache'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
& icacls.exe $cache /grant '*S-1-5-19:(OI)(CI)M' /T | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot grant cache write access.' }
$action = New-ScheduledTaskAction -Execute $node -Argument ('"' + (Join-Path $root 'scripts/start-vps.mjs') + '"') -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\LOCAL SERVICE' -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'People OS web on loopback; PostgreSQL on this VPS' | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'PeopleOS-Web installed. Check: Invoke-RestMethod http://127.0.0.1:3000/health'
