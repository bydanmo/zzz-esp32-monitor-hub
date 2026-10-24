#Requires -Version 5.1
<#
    ESP32 Monitor Hub 的 Windows 运行控制器。

    用法：
      powershell -File scripts/monitor.ps1 -Action Start
      powershell -File scripts/monitor.ps1 -Action Stop
      powershell -File scripts/monitor.ps1 -Action InstallAutostart
      powershell -File scripts/monitor.ps1 -Action UninstallAutostart
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop', 'InstallAutostart', 'UninstallAutostart')]
    [string] $Action,
    [switch] $NoBrowser,
    [switch] $ForceBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDirectory = Join-Path $projectRoot '.runtime'
$statePath = Join-Path $runtimeDirectory 'hub-state.json'
$nodeForConfig = Get-Command 'node.exe' -ErrorAction SilentlyContinue
if ($null -eq $nodeForConfig) { $nodeForConfig = Get-Command 'node' -ErrorAction Stop }
Push-Location $projectRoot
try { $listenPort = [int](& $nodeForConfig.Source --env-file-if-exists=.env -p 'process.env.HUB_PORT || "8787"') }
finally { Pop-Location }
if ($listenPort -lt 1 -or $listenPort -gt 65535) { throw 'HUB_PORT must be 1-65535.' }
$healthUrl = "http://127.0.0.1:$listenPort/api/health"
$webUrl = "http://127.0.0.1:$listenPort"
$hubEntry = Join-Path $projectRoot 'hub\dist\index.js'
$webEntry = Join-Path $projectRoot 'web\dist\index.html'
$shortcutName = 'ESP32 Monitor Hub.lnk'

function Test-HubHealth {
    $response = $null
    $reader = $null
    try {
        # The health endpoint is always loopback. Do not route it through a
        # user's system proxy/PAC configuration or wait for proxy discovery.
        $request = [System.Net.HttpWebRequest]::Create($healthUrl)
        $request.Proxy = $null
        $request.Timeout = 2000
        $request.ReadWriteTimeout = 2000
        $response = $request.GetResponse()
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $health = $reader.ReadToEnd() | ConvertFrom-Json
        return $health.ok -eq $true -and $health.service -eq 'esp32-monitor-hub'
    }
    catch {
        Write-Verbose ("Health check failed: " + $_.Exception.Message)
        return $false
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $response) { $response.Close() }
    }
}

function Read-RuntimeState {
    if (-not (Test-Path -LiteralPath $statePath)) { return $null }
    try {
        return Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    }
    catch {
        Write-Warning "运行状态文件损坏，将忽略：$statePath"
        return $null
    }
}

function Get-ManagedProcess {
    $state = Read-RuntimeState
    if ($null -eq $state -or $null -eq $state.pid -or $null -eq $state.startTimeFileUtc) {
        return $null
    }
    try {
        $process = Get-Process -Id ([int]$state.pid) -ErrorAction Stop
        if ($process.ProcessName -ne 'node') { return $null }
        if ([string]$process.StartTime.ToFileTimeUtc() -ne [string]$state.startTimeFileUtc) {
            return $null
        }
        return $process
    }
    catch {
        return $null
    }
}

function Test-BuildRequired {
    if (-not (Test-Path -LiteralPath $hubEntry) -or -not (Test-Path -LiteralPath $webEntry)) {
        return $true
    }

    $inputPaths = @(
        (Join-Path $projectRoot 'hub\src'),
        (Join-Path $projectRoot 'web\src'),
        (Join-Path $projectRoot 'web\public'),
        (Join-Path $projectRoot 'shared'),
        (Join-Path $projectRoot 'scripts\generate-ui-contracts.mjs'),
        (Join-Path $projectRoot 'web\index.html'),
        (Join-Path $projectRoot 'package.json'),
        (Join-Path $projectRoot 'package-lock.json')
    )
    $latestInput = [DateTime]::MinValue
    foreach ($inputPath in $inputPaths) {
        if (-not (Test-Path -LiteralPath $inputPath)) { continue }
        $item = Get-Item -LiteralPath $inputPath
        $candidates = if ($item.PSIsContainer) {
            Get-ChildItem -LiteralPath $inputPath -File -Recurse
        } else {
            @($item)
        }
        foreach ($candidate in $candidates) {
            if ($candidate.LastWriteTimeUtc -gt $latestInput) {
                $latestInput = $candidate.LastWriteTimeUtc
            }
        }
    }

    $hubOutput = (Get-Item -LiteralPath $hubEntry).LastWriteTimeUtc
    $webOutput = (Get-Item -LiteralPath $webEntry).LastWriteTimeUtc
    $oldestOutput = if ($hubOutput -lt $webOutput) { $hubOutput } else { $webOutput }
    return $latestInput -gt $oldestOutput
}

function Invoke-ProjectBuild {
    $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($null -eq $npm) { $npm = Get-Command 'npm' -ErrorAction SilentlyContinue }
    if ($null -eq $npm) {
        throw '找不到 npm。请先安装 Node.js LTS，然后重新双击启动。'
    }
    Write-Host '检测到网页或 Hub 尚未构建/已有更新，正在执行 npm run build...'
    Push-Location $projectRoot
    try {
        & $npm.Source run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build 失败（退出码 $LASTEXITCODE）" }
    }
    finally {
        Pop-Location
    }
}

function Open-MonitorWeb {
    if (-not $NoBrowser) {
        # Vite assets use content hashes, but an already-open tab keeps running
        # its old JavaScript until the document is reloaded. Give every desktop
        # launch a fresh document URL so newly built validation rules take effect.
        $webVersion = (Get-Item -LiteralPath $webEntry).LastWriteTimeUtc.Ticks
        Start-Process ("$webUrl/?v=$webVersion")
    }
}

function Start-Hub {
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null

    $buildRequired = $ForceBuild -or (Test-BuildRequired)
    $managedProcess = Get-ManagedProcess
    $hubOutputChanged = $false
    if ($null -ne $managedProcess -and (Test-Path -LiteralPath $hubEntry)) {
        $hubOutputChanged = (Get-Item -LiteralPath $hubEntry).LastWriteTimeUtc -gt $managedProcess.StartTime.ToUniversalTime()
    }
    $restartRequired = $buildRequired -or $hubOutputChanged

    if ($null -ne $managedProcess -and -not $restartRequired) {
        if (Test-HubHealth) {
            Write-Host "ESP32 Monitor Hub 已在运行（PID $($managedProcess.Id)）。"
        } else {
            Write-Warning "Hub 进程仍在运行（PID $($managedProcess.Id)），但暂时无法确认 HTTP 健康。本次保留进程；请查看日志，必要时先停止再启动。"
        }
        Open-MonitorWeb
        return
    }
    if ($null -ne $managedProcess) {
        if ($restartRequired) {
            Write-Host '检测到构建产物或源码已更新，正在重启 Hub 以加载新后端。'
        } else {
            Write-Warning '正在重启本启动器管理的旧 Hub。'
        }
        Stop-Process -Id $managedProcess.Id -Force
        $managedProcess.WaitForExit(5000) | Out-Null
    }
    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue

    if (Test-HubHealth) {
        Write-Host '8787 端口上已有 ESP32 Monitor Hub 在运行；本次不重复启动。'
        Open-MonitorWeb
        return
    }

    if ($buildRequired) {
        Invoke-ProjectBuild
    }

    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if ($null -eq $node) { $node = Get-Command 'node' -ErrorAction SilentlyContinue }
    if ($null -eq $node) {
        throw '找不到 Node.js。请先安装 Node.js LTS，然后重新双击启动。'
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdoutPath = Join-Path $runtimeDirectory "hub-$stamp.stdout.log"
    $stderrPath = Join-Path $runtimeDirectory "hub-$stamp.stderr.log"
    $process = Start-Process -FilePath $node.Source -ArgumentList '--env-file-if-exists=.env hub/dist/index.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

    try {
        $ready = $false
        $startupWatch = [Diagnostics.Stopwatch]::StartNew()
        while ($startupWatch.ElapsedMilliseconds -lt 15000) {
            if ($process.HasExited) { break }
            if (Test-HubHealth) { $ready = $true; break }
            Start-Sleep -Milliseconds 500
        }
        if (-not $ready) {
            throw "Hub 未能在 15 秒内启动。请查看日志：$stderrPath"
        }

        [ordered]@{
            pid = $process.Id
            startTimeFileUtc = [string]$process.StartTime.ToFileTimeUtc()
            startedAt = (Get-Date).ToString('o')
            projectRoot = $projectRoot
            stdoutLog = $stdoutPath
            stderrLog = $stderrPath
        } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

        Write-Host "ESP32 Monitor Hub 已启动（PID $($process.Id)）。"
        Write-Host "控制台：$webUrl"
        Write-Host "日志目录：$runtimeDirectory"
        Open-MonitorWeb
    }
    catch {
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
        throw
    }
}

function Stop-Hub {
    $managedProcess = Get-ManagedProcess
    if ($null -eq $managedProcess) {
        Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
        if (Test-HubHealth) {
            throw 'Hub 正在运行，但不是由本启动器创建。为避免结束错误进程，请先关闭原来的终端窗口。'
        }
        Write-Host 'ESP32 Monitor Hub 当前未运行。'
        return
    }

    Stop-Process -Id $managedProcess.Id
    if (-not $managedProcess.WaitForExit(10000)) {
        Stop-Process -Id $managedProcess.Id -Force
    }
    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
    Write-Host 'ESP32 Monitor Hub 已停止。'
}

function Install-Autostart {
    $startupDirectory = [Environment]::GetFolderPath('Startup')
    if ([string]::IsNullOrWhiteSpace($startupDirectory)) {
        throw '无法获取当前用户的 Windows 启动目录。'
    }
    $shortcutPath = Join-Path $startupDirectory $shortcutName
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = '-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Action Start -NoBrowser' -f $PSCommandPath
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.Description = '后台启动 ESP32 Monitor Hub'
    $shortcut.Save()
    Write-Host "已启用当前用户开机自启：$shortcutPath"
}

function Uninstall-Autostart {
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) $shortcutName
    if (Test-Path -LiteralPath $shortcutPath) {
        Remove-Item -LiteralPath $shortcutPath -Force
        Write-Host '已取消 ESP32 Monitor Hub 开机自启。'
    } else {
        Write-Host 'ESP32 Monitor Hub 尚未启用开机自启。'
    }
}

switch ($Action) {
    'Start' { Start-Hub }
    'Stop' { Stop-Hub }
    'InstallAutostart' { Install-Autostart }
    'UninstallAutostart' { Uninstall-Autostart }
}
