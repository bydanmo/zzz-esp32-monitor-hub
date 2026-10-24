#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$IdfPath = $env:IDF_PATH,
    [string]$ToolsPath = $env:IDF_TOOLS_PATH,
    [string]$PythonPath = '',
    [string]$BuildDir = (Join-Path $env:TEMP 'zzz-esp32-monitor-build'),
    [string]$Port = '',
    [switch]$SetTarget,
    [switch]$Flash
)
$ErrorActionPreference = 'Stop'
if (-not $IdfPath -or -not (Test-Path (Join-Path $IdfPath 'tools/idf.py'))) {
    throw 'Run in the ESP-IDF 5.4.1 PowerShell environment, or pass -IdfPath, -ToolsPath and -PythonPath.'
}
if (-not $PythonPath) {
    $pythonCommand = Get-Command python -ErrorAction Stop
    $PythonPath = $pythonCommand.Source
}
if ($BuildDir -notmatch '^[\x20-\x7E]+$') { throw 'Pass -BuildDir with an ASCII-only absolute path.' }
if ($ToolsPath) { $env:IDF_TOOLS_PATH = $ToolsPath }
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONNOUSERSITE = 'True'
$env:IDF_TARGET = 'esp32s3'
if (-not $env:PROCESSOR_ARCHITECTURE) { $env:PROCESSOR_ARCHITECTURE = 'AMD64' }
$env:PATH = "$(Split-Path $PythonPath);$env:PATH"
. (Join-Path $IdfPath 'export.ps1')
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../firmware')).Path
$privateConfig = Join-Path $sourceRoot 'main/wifi_config.h'
if (-not (Test-Path -LiteralPath $privateConfig)) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'main/wifi_config.example.h') -Destination $privateConfig
    Write-Warning 'Created local wifi_config.h from example. Edit it before using the device on Wi-Fi.'
}
Push-Location $sourceRoot
try {
    $idf = Join-Path $IdfPath 'tools/idf.py'
    $arguments = @('--no-ccache','-B',$BuildDir)
    if ($SetTarget) {
        & $PythonPath $idf @arguments set-target esp32s3
        if ($LASTEXITCODE -ne 0) { throw 'set-target failed' }
    }
    & $PythonPath $idf @arguments build
    if ($LASTEXITCODE -ne 0) { throw 'Firmware build failed' }
    $dist = Join-Path $sourceRoot 'dist'
    New-Item -ItemType Directory -Force -Path $dist | Out-Null
    Copy-Item -LiteralPath (Join-Path $BuildDir 'esp32_monitor.bin') -Destination $dist -Force
    if ($Flash) {
        if (-not $Port) { throw 'Pass -Port with the actual ESP32 serial port.' }
        & $PythonPath $idf @arguments -p $Port flash
        if ($LASTEXITCODE -ne 0) { throw 'Flash failed' }
    }
}
finally { Pop-Location }
