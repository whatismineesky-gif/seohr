param([string]$Origin = 'https://vps.member-seo.com')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$admin = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open PowerShell as Administrator.' }
$uri = [Uri]$Origin
if ($uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) { throw 'Origin must be an HTTPS origin.' }
$configDir = Join-Path $root 'config'
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
& icacls.exe $configDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' /T | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot protect configuration directory.' }
$configPath = Join-Path $configDir 'runtime.json'
if (Test-Path $configPath) { throw 'Configuration already exists. Edit the existing file locally; this script will not overwrite it.' }
$caPath = Read-Host 'CA file path (Enter = C:\people-os-tls\ca.crt)'
if (-not $caPath) { $caPath = 'C:\people-os-tls\ca.crt' }
if (-not (Test-Path $caPath -PathType Leaf)) { throw 'CA file does not exist.' }
$localCA = Join-Path $configDir 'postgres-ca.crt'
Copy-Item -LiteralPath $caPath -Destination $localCA
$secure = Read-Host 'Existing password for people_os_app' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if (-not $password) { throw 'Password is required.' }
  $settings = @{ origin=$uri.GetLeftPart([UriPartial]::Authority); maintenance=$false; database=@{ host='127.0.0.1'; port=5432; name='people_os'; user='people_os_app'; password=$password; sslMode='verify-full'; caPath=$localCA; poolMax=10 } }
  $settings | ConvertTo-Json -Depth 5 | Set-Content -Path $configPath -Encoding UTF8
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $password=$null; $settings=$null }
Write-Host 'Configuration saved. Password was not printed. Next: npm run check:db'
