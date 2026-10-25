param(
    [string]$HubUrl = 'http://127.0.0.1:8787',
    [string]$OutputPath = '.runtime/hub-observation.jsonl',
    [ValidateRange(1, 10080)][int]$DurationMinutes = 1440,
    [ValidateRange(1, 3600)][int]$IntervalSeconds = 60
)

$ErrorActionPreference = 'Stop'
$uri = $HubUrl.TrimEnd('/')
$path = [System.IO.Path]::GetFullPath($OutputPath)
$directory = [System.IO.Path]::GetDirectoryName($path)
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$endUtc = [DateTimeOffset]::UtcNow.AddMinutes($DurationMinutes)

while ([DateTimeOffset]::UtcNow -lt $endUtc) {
    $now = [DateTimeOffset]::UtcNow
    $entry = [ordered]@{
        atUtc = $now.ToString('o')
        hubOk = $false
        connectedDevices = $null
        identifiedDevices = $null
        appliedRevisions = @()
        heartbeatAgeSeconds = @()
        providerStatuses = @()
        error = $null
    }
    try {
        $health = Invoke-RestMethod -Uri "$uri/api/health" -TimeoutSec 5
        $devices = Invoke-RestMethod -Uri "$uri/api/devices" -TimeoutSec 5
        $providers = Invoke-RestMethod -Uri "$uri/api/providers" -TimeoutSec 5
        $entry.hubOk = [bool]$health.ok
        $entry.connectedDevices = [int]$health.connectedDevices
        $entry.identifiedDevices = [int]$health.identifiedDevices
        $entry.appliedRevisions = @($devices.devices | ForEach-Object { $_.appliedRevision })
        $entry.heartbeatAgeSeconds = @($devices.devices | ForEach-Object {
            [math]::Round(($now - [DateTimeOffset]::Parse($_.lastSeenAt)).TotalSeconds, 1)
        })
        $entry.providerStatuses = @($providers.providers | ForEach-Object { $_.status })
    } catch {
        $entry.error = $_.Exception.Message
    }
    [System.IO.File]::AppendAllText($path, (($entry | ConvertTo-Json -Compress -Depth 4) + "`n"), [System.Text.UTF8Encoding]::new($false))
    $remaining = ($endUtc - [DateTimeOffset]::UtcNow).TotalSeconds
    if ($remaining -gt 0) {
        Start-Sleep -Seconds ([math]::Min($IntervalSeconds, $remaining))
    }
}
