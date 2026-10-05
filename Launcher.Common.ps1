function Get-AgentDemoNode {
    $taskCandidates = @()
    $taskCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($taskCommand) { $taskCandidates += $taskCommand.Source }
    if ($env:ProgramFiles) { $taskCandidates += Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if ($env:USERPROFILE) { $taskCandidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
    foreach ($taskCandidate in $taskCandidates | Select-Object -Unique) {
        if (Test-Path -LiteralPath $taskCandidate) {
            $taskVersion = & $taskCandidate -p 'Number(process.versions.node.split(String.fromCharCode(46))[0])'
            if ($LASTEXITCODE -eq 0 -and [int]$taskVersion -ge 24) { return $taskCandidate }
        }
    }
    throw 'Node.js 24+ is required. Install it from https://nodejs.org or run: winget install OpenJS.NodeJS.LTS . Then reopen First-Start-Amadeus.cmd.'
}

# Content fingerprints detect updates even when an old dist directory is retained.
function Get-AgentDemoFingerprint([string]$Root, [switch]$DependenciesOnly) {
    $taskFiles = @('package.json', 'pnpm-lock.yaml')
    if (-not $DependenciesOnly) {
        $taskFiles += @('index.html', 'vite.config.ts', 'tsconfig.json')
        foreach ($taskDir in @('src', 'shared', 'server', 'public')) {
            if (Test-Path -LiteralPath (Join-Path $Root $taskDir)) {
                $taskFiles += Get-ChildItem -LiteralPath (Join-Path $Root $taskDir) -Recurse -File |
                    ForEach-Object { $_.FullName.Substring($Root.Length + 1) }
            }
        }
    }
    $taskHashes = foreach ($taskRelative in ($taskFiles | Sort-Object -Unique)) {
        $taskPath = Join-Path $Root $taskRelative
        if (Test-Path -LiteralPath $taskPath -PathType Leaf) {
            $taskRelative + ':' + (Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash
        }
    }
    $taskHasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($taskHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes(($taskHashes -join "
")))).Replace('-', '')
    } finally { $taskHasher.Dispose() }
}
function Test-AgentDemoStamp([string]$Path, [string]$Expected) {
    return (Test-Path -LiteralPath $Path) -and ((Get-Content -LiteralPath $Path -Raw).Trim() -eq $Expected)
}
