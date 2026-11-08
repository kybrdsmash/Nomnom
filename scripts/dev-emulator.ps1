# Local review loop: boots the Pixel 9 Pro XL emulator (if it isn't already
# running) and opens the app on it in Expo Go with live reload.
#
#   npm run emu
#
# Save a file -> the emulator reloads. In this window: r = reload,
# j = debugger, Ctrl+C = stop. The emulator window stays open between runs.
#
# Google sign-in isn't available in Expo Go (src/api/googleAuth.js) - use a
# real build for anything sign-in related.

$ErrorActionPreference = 'Stop'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_HOME = $sdk
$env:Path = "$sdk\platform-tools;$env:Path"
$avd = 'Pixel_9_Pro_XL'
$adb = "$sdk\platform-tools\adb.exe"

$running = (& $adb devices) -match '^emulator-\d+\s+device'
if (-not $running) {
  Write-Host "Booting $avd..."
  Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList '-avd', $avd
  & $adb wait-for-device
}
$serial = ((& $adb devices) -match '^emulator-\d+\s+device' | Select-Object -First 1) -replace '\s+device$', ''
# Pin Expo/adb to the emulator even when a real phone is plugged in over USB.
$env:ANDROID_SERIAL = $serial
while ((& $adb -s $serial shell getprop sys.boot_completed 2>$null) -notmatch '1') { Start-Sleep -Seconds 2 }
Write-Host "Emulator ready ($serial). Starting Expo..."

Set-Location (Join-Path $PSScriptRoot '..')
npx expo start --android --go
