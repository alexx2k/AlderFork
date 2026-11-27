param(
    [Parameter(Mandatory=$true)][string]$Label,
    [string]$Serial = "",
    [string]$Package = "dev.tarn.dev",
    [string]$ActivityClass = "dev.tarn.ProfilesActivity",
    [int]$Runs = 5,
    [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
)
$ErrorActionPreference = "Stop"
if ($Runs -lt 1) { throw "Runs must be at least 1." }
if ($Label -notmatch '^[a-zA-Z0-9_-]+$') { throw "Use a simple label." }
if ($Package -notmatch '^[a-zA-Z0-9_.]+$') { throw "Invalid package." }
if (-not (Test-Path $Adb)) { $Adb = (Get-Command adb -ErrorAction Stop).Source }
$deviceArgs = @()
if ($Serial) { $deviceArgs = @("-s", $Serial) }
$activity = "$Package/$ActivityClass"
$folder = Join-Path (Get-Location) ("benchmarks/" + $Label + "-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $folder -Force | Out-Null

function Invoke-Adb {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Command)
    & $Adb @deviceArgs @Command
    if ($LASTEXITCODE -ne 0) { throw "ADB failed: $($Command -join ' ')" }
}
Invoke-Adb get-state | Out-File "$folder/device.txt"
Invoke-Adb shell getprop ro.product.model | Out-File "$folder/device.txt" -Append
Invoke-Adb shell getprop ro.build.version.release | Out-File "$folder/device.txt" -Append
Invoke-Adb shell dumpsys package $Package | Out-File "$folder/package.txt"
for ($i = 1; $i -le $Runs; $i++) {
    Invoke-Adb shell am force-stop $Package | Out-Null
    Start-Sleep -Seconds 2
    Invoke-Adb shell am start -W -n $activity | Out-File "$folder/cold-$i.txt"
    Start-Sleep -Seconds 3
    Invoke-Adb shell input keyevent KEYCODE_HOME | Out-Null
    Start-Sleep -Seconds 2
    Invoke-Adb shell am start -W -n $activity | Out-File "$folder/resume-$i.txt"
    Start-Sleep -Seconds 3
}
Invoke-Adb shell dumpsys meminfo $Package | Out-File "$folder/memory-before.txt"
Invoke-Adb shell dumpsys gfxinfo $Package reset | Out-File "$folder/gfx-reset.txt"
Write-Host "Use the same 60-second D-pad navigation sequence on each build. Then return here."
Read-Host "Press Enter after the sequence" | Out-Null
Invoke-Adb shell dumpsys gfxinfo $Package framestats | Out-File "$folder/frames.txt"
Invoke-Adb shell dumpsys meminfo $Package | Out-File "$folder/memory-after.txt"
Invoke-Adb shell dumpsys cpuinfo | Out-File "$folder/cpu.txt"
Write-Host "Results saved to $folder. No app data was cleared."
