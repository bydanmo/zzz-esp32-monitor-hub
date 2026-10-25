param([string]$Gcc = 'gcc')

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$outputDirectory = Join-Path $env:TEMP 'zzz-monitor-config-delivery-test'
$null = New-Item -ItemType Directory -Path $outputDirectory -Force
# GCC launches cc1/ld from its own directory; keep those runtime DLLs on PATH.
$env:PATH = "$(Split-Path (Get-Command $Gcc -ErrorAction Stop).Source);$env:PATH"
$executable = Join-Path $outputDirectory 'config-delivery-test.exe'
$mainDirectory = Join-Path $projectRoot 'firmware/main'
$source = Join-Path $mainDirectory 'config_delivery.c'
$testSource = Join-Path $PSScriptRoot 'tests/config-delivery-test.c'

& $Gcc -std=c11 -Wall -Wextra -Werror -pedantic -I $mainDirectory $source $testSource -o $executable
if ($LASTEXITCODE -ne 0) { throw 'Firmware configuration delivery test compilation failed.' }
& $executable
if ($LASTEXITCODE -ne 0) { throw 'Firmware configuration delivery regression failed.' }
