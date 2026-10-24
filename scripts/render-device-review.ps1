#Requires -Version 5.1
[CmdletBinding()]
param([string]$Gcc = 'C:\msys64\ucrt64\bin\gcc.exe')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
    $build = '.runtime/lvgl-host'
    $output = 'docs/design-system/compact-layout-review'
    $raw = "$build/raw"
    New-Item -ItemType Directory -Force -Path $build,$output,$raw | Out-Null
    if (-not (Test-Path -LiteralPath $Gcc)) { throw 'Pass -Gcc with a native Windows GCC compiler.' }
    $env:PATH = "$(Split-Path $Gcc);$env:PATH"
    $sources = @(Get-ChildItem firmware/managed_components/lvgl__lvgl/src -Filter '*.c' -Recurse | ForEach-Object {
        $_.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
    })
    $common = @('-std=c11','-O1','-DLV_KCONFIG_IGNORE','-DLV_CONF_INCLUDE_SIMPLE',
        '-Iscripts/lvgl-host','-Ifirmware/managed_components/lvgl__lvgl',
        '-Ifirmware/main','-Ifirmware/main/ui')
    $dependencyFiles = @(Get-ChildItem firmware/managed_components/lvgl__lvgl -File -Recurse) + @(Get-Item scripts/lvgl-host/lv_conf.h)
    $signature = ($dependencyFiles | ForEach-Object { "$($_.FullName):$($_.Length):$($_.LastWriteTimeUtc.Ticks)" }) -join "`n"
    $cached = if (Test-Path "$build/dependencies.txt") { Get-Content "$build/dependencies.txt" -Raw } else { '' }
    if (-not (Test-Path "$build/lvgl.o") -or $cached.TrimEnd() -ne $signature.TrimEnd()) {
        Set-Content "$build/lvgl.rsp" -Value ($common + $sources + @('-r','-o',"$build/lvgl.o")) -Encoding ASCII
        & $Gcc "@$build/lvgl.rsp"
        if ($LASTEXITCODE -ne 0) { throw 'LVGL host library compilation failed.' }
        Set-Content "$build/dependencies.txt" -Value $signature -Encoding UTF8
    }
    $sources = @(Get-ChildItem firmware/main/ui -Filter '*.c' | ForEach-Object {
        $_.FullName.Substring($projectRoot.Length + 1).Replace('\','/')
    })
    $sources += 'scripts/lvgl-host/render.c'
    $arguments = $common + $sources + @("$build/lvgl.o",'-lm','-o',"$build/render.exe")
    Set-Content "$build/sources.rsp" -Value $arguments -Encoding ASCII
    & $Gcc "@$build/sources.rsp"
    if ($LASTEXITCODE -ne 0) { throw 'LVGL host compilation failed.' }
    $result = & "$build/render.exe" $raw
    if ($LASTEXITCODE -ne 0) { throw 'LVGL host checks failed.' }
    [System.IO.File]::WriteAllText((Join-Path $projectRoot "$output/host-checks.json"),
        (($result -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))
    Write-Output $result
}
finally { Pop-Location }
