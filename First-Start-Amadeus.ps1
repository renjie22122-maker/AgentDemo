param([switch]$NoBrowser, [switch]$SetupOnly)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
# Never replace dependencies underneath a live runtime.
$taskExisting = $null
try { $taskExisting = Invoke-RestMethod 'http://127.0.0.1:8810/api/health' -TimeoutSec 2 } catch {}
if ($taskExisting.application -in @('Amadeus', 'AgentDemo')) {
    throw 'Amadeus is already running. Setup has not changed any dependencies. Finish your tasks and stop the service before running First Start; use Start-Amadeus.cmd to open the current service.'
}
. (Join-Path $taskRoot 'Launcher.Common.ps1')
$taskNode = Get-AgentDemoNode
$env:PATH = (Split-Path $taskNode) + ';' + $env:PATH
Push-Location $taskRoot
try {
    Write-Host '[1/3] Installing locked dependencies. Internet access is required on first use.'
    $taskPnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    $taskNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    $taskNpmCli = Join-Path (Split-Path $taskNode) 'node_modules\npm\bin\npm-cli.js'
    if ($taskPnpm -and ((& $taskPnpm.Source --version) -eq '11.19.0')) {
        & $taskPnpm.Source install --frozen-lockfile
    } elseif ($taskNpm) {
        & $taskNpm.Source exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile
    } elseif (Test-Path -LiteralPath $taskNpmCli) {
        & $taskNode $taskNpmCli exec --yes --package=pnpm@11.19.0 -- pnpm install --frozen-lockfile
    } else {
        throw 'No package manager found. Install the official Node.js 24+ distribution (including npm), then reopen this launcher.'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the output above. Native build errors may require Python and Visual Studio C++ Build Tools; network errors require a working registry connection. Fix the cause and rerun First Start; your data is preserved.' }
    Set-Content -LiteralPath (Join-Path $taskRoot 'node_modules/.agentdemo-dependencies') -Value (Get-AgentDemoFingerprint $taskRoot -DependenciesOnly)
    Write-Host '[2/3] Checking and building Amadeus...'
    & $taskNode node_modules/typescript/bin/tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed; service was not started.' }
    & $taskNode node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed; service was not started.' }
    Set-Content -LiteralPath (Join-Path $taskRoot 'dist/.agentdemo-build') -Value (Get-AgentDemoFingerprint $taskRoot)
    Write-Host '[3/3] Setup complete.'
} finally { Pop-Location }
if (-not $SetupOnly) { & (Join-Path $taskRoot 'Start-Amadeus.ps1') -NoBrowser:$NoBrowser }
