param([string]$Device='lgtv')
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$app = Get-Content public/appinfo.json -Raw | ConvertFrom-Json
& ares-inspect.cmd --device $Device --app $app.id --open
if ($LASTEXITCODE -ne 0) { throw 'Inspector failed' }
