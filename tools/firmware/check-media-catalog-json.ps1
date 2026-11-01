[CmdletBinding()]
param(
    [string]$Gcc='C:\msys64\ucrt64\bin\gcc.exe',
    [string]$CjsonRoot=$(if($env:IDF_PATH){Join-Path $env:IDF_PATH 'components/json/cJSON'}else{''}),
    [string]$Manifest=''
)
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if(-not (Test-Path (Join-Path $CjsonRoot 'cJSON.c'))){throw 'Pass -CjsonRoot pointing to the installed ESP-IDF cJSON source.'}
Push-Location $taskRoot
try {
    New-Item -ItemType Directory -Force .runtime/catalog-json-check | Out-Null
    $env:PATH="$(Split-Path $Gcc);$env:PATH"
    & $Gcc '-std=c11' '-O2' '-Wall' '-Wextra' '-Werror' '-Ifirmware/main' "-I$CjsonRoot" 'firmware/main/media_catalog_json.c' 'firmware/main/media_catalog.c' 'firmware/main/animation_preferences.c' (Join-Path $CjsonRoot 'cJSON.c') 'tools/firmware/lvgl-host/media_catalog_json_test.c' '-lm' '-o' '.runtime/catalog-json-check/test.exe'
    if($LASTEXITCODE -ne 0){throw 'Catalog decoder compilation failed.'}
    if($Manifest){ & .\.runtime\catalog-json-check\test.exe $Manifest } else { & .\.runtime\catalog-json-check\test.exe }
    if($LASTEXITCODE -ne 0){throw 'Catalog decoder checks failed.'}
} finally { Pop-Location }
