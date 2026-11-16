# Run from any directory inside your AlderFork Git checkout:
#   .\scripts\install-still-watching-dev.ps1 -FireTvIp 192.168.1.100
# Fire TV: enable ADB debugging in Settings > My Fire TV > Developer options.
param(
    [Parameter(Mandatory = $true)]
    [string]$FireTvIp,
    [int]$Port = 5555
)

$ErrorActionPreference = "Stop"
$branch = "feature/are-you-still-watching"

function Check-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit code $LASTEXITCODE)." }
}

$root = (& git rev-parse --show-toplevel).Trim()
Check-Exit "Find repository"
Set-Location $root

& git fetch origin $branch
Check-Exit "Fetch development branch"
& git switch $branch
Check-Exit "Switch to development branch"
& git pull --ff-only origin $branch
Check-Exit "Pull development branch"

& .\gradlew.bat --no-configuration-cache clean testDebugUnitTest assembleDebug
Check-Exit "Build and unit tests"

$apk = Join-Path $root "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { throw "Debug APK was not produced: $apk" }

$adb = (Get-Command adb -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
if (-not $adb) {
    $sdkLocations = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk") |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($sdk in $sdkLocations) {
        $candidate = Join-Path $sdk "platform-tools\adb.exe"
        if (Test-Path $candidate) { $adb = $candidate; break }
    }
}
if (-not $adb) {
    throw "ADB not found. Install Android SDK Platform-Tools or add its platform-tools folder to Windows PATH."
}

$target = "${FireTvIp}:${Port}"
& $adb connect $target
Check-Exit "Connect to Fire TV"
& $adb -s $target install -r $apk
Check-Exit "Install development APK"
Write-Host "Installed Alder Fork development build on $target (package dev.alderfork.dev)." -ForegroundColor Green
