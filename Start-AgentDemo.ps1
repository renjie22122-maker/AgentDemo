param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskUrl = 'http://127.0.0.1:8810'
try {
    $taskHealth = Invoke-RestMethod "$taskUrl/api/health" -TimeoutSec 2
    if ($taskHealth.application -eq 'AgentDemo') {
        if (-not $NoBrowser) { Start-Process $taskUrl }
        Write-Host "AgentDemo is already running at $taskUrl"
        exit 0
    }
} catch {}
. (Join-Path $taskRoot 'Launcher.Common.ps1')
$taskNode = Get-AgentDemoNode
$env:PATH = (Split-Path $taskNode) + ';' + $env:PATH
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'node_modules\tsx'))) {
    Write-Host 'First launch detected. Preparing dependencies and frontend...'
    & (Join-Path $taskRoot 'First-Start-AgentDemo.ps1') -SetupOnly -NoBrowser
}
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist\index.html'))) {
    Push-Location $taskRoot
    try {
        & $taskNode node_modules/typescript/bin/tsc --noEmit
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
        & $taskNode node_modules/vite/bin/vite.js build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
}
$taskLogs = Join-Path $taskRoot '.data\logs'
New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
Start-Process -FilePath $taskNode -ArgumentList @('scripts/supervisor.mjs') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'supervisor.stdout.log') -RedirectStandardError (Join-Path $taskLogs 'supervisor.stderr.log') | Out-Null
$taskReady = $false
for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $taskHealth = Invoke-RestMethod "$taskUrl/api/health" -TimeoutSec 1
        if ($taskHealth.application -eq 'AgentDemo') { $taskReady = $true; break }
    } catch {}
}
if (-not $taskReady) { throw "AgentDemo did not become ready. Check $taskLogs" }
if (-not $NoBrowser) { Start-Process $taskUrl }
Write-Host "AgentDemo is ready at $taskUrl"
