param([Parameter(Mandatory=$true)][string]$SimulatorVersion)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
& ares-launch.cmd -s $SimulatorVersion dist
if ($LASTEXITCODE -ne 0) { throw 'Simulator launch failed; check ares-launch --help and installed simulator' }
