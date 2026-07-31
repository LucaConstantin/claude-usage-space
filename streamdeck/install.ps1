# Installs the Claude Usage Deck plugin into the Stream Deck plugins folder.
$ErrorActionPreference = 'Stop'
$src  = Join-Path $PSScriptRoot 'com.claudeusage.deck.sdPlugin'
$dest = Join-Path $env:APPDATA 'Elgato\StreamDeck\Plugins\com.claudeusage.deck.sdPlugin'

if (-not (Test-Path $src)) { Write-Error "Plugin source not found: $src"; exit 1 }

Write-Host 'Closing Stream Deck...'
Get-Process StreamDeck -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1200

if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
Copy-Item $src $dest -Recurse -Force
Write-Host "Installed to: $dest"

$exe = @(
  (Join-Path $env:ProgramFiles 'Elgato\StreamDeck\StreamDeck.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Elgato\StreamDeck\StreamDeck.exe')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($exe) { Write-Host 'Relaunching Stream Deck...'; Start-Process $exe }
else { Write-Host 'Plugin installed. Start the Stream Deck app manually.' }

Write-Host 'Done. In Stream Deck, drag the "Usage Tile" (Claude Usage category) onto every key.'
