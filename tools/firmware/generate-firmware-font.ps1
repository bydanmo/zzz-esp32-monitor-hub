#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$FontPath = 'C:\Windows\Fonts\NotoSansSC-VF.ttf',
    [string]$PythonPath = 'python',
    [string]$ConverterPath = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $ConverterPath) {
    $local = Join-Path $projectRoot 'node_modules/lv_font_conv/lv_font_conv.js'
    if (Test-Path -LiteralPath $local) { $ConverterPath = $local }
    else {
        $cache = Join-Path $env:LOCALAPPDATA 'npm-cache/_npx/*/node_modules/lv_font_conv/lv_font_conv.js'
        $ConverterPath = Get-ChildItem -Path $cache -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
}
if (-not $ConverterPath -or -not (Test-Path -LiteralPath $ConverterPath)) {
    throw 'Pass -ConverterPath with a local lv_font_conv.js (no implicit network installs).'
}
& $PythonPath (Join-Path $PSScriptRoot 'generate-device-fonts.py') --font $FontPath --converter $ConverterPath
if ($LASTEXITCODE -ne 0) { throw 'Device font generation failed. Python requires fontTools.' }
