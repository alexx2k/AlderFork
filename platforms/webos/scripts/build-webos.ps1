param([switch]$InstallDependencies)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function Invoke-Step([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed ($LASTEXITCODE)" }
}
if ($InstallDependencies -or !(Test-Path 'node_modules')) { if (Test-Path 'package-lock.json') { Invoke-Step npm.cmd @('ci') } else { Invoke-Step npm.cmd @('install') } }
Invoke-Step npm.cmd @('run','typecheck')
Invoke-Step npm.cmd @('test')
Invoke-Step npm.cmd @('run','build')
New-Item -ItemType Directory -Force packages | Out-Null
Invoke-Step ares-package.cmd @('--no-minify','-o','packages','dist')
