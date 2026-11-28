param([string]$Device='lgtv',[switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (!$SkipBuild) { & "$PSScriptRoot/build-webos.ps1" }
$app = Get-Content public/appinfo.json -Raw | ConvertFrom-Json
$package = "packages/$($app.id)_$($app.version)_all.ipk"
if (!(Test-Path $package)) { throw "Package not found: $package" }
& ares-install.cmd --device $Device $package
if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
& ares-launch.cmd --device $Device $app.id
if ($LASTEXITCODE -ne 0) { throw 'Launch failed' }
