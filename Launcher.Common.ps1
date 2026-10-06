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


# Support both the Windows installer layout and portable node/bin + node_modules layout.
# Return a command and arguments; do not install anything during discovery.
function Get-AmadeusPackageManager([string]$Node) {
    $taskNodeDir = Split-Path -Parent $Node
    $taskRoots = @($taskNodeDir, (Split-Path -Parent $taskNodeDir))
    $taskPnpmCandidates = @()
    foreach ($taskName in @('pnpm.cmd', 'pnpm.exe')) {
        $taskCommand = Get-Command $taskName -ErrorAction SilentlyContinue
        if ($taskCommand) { $taskPnpmCandidates += @{ File = $taskCommand.Source; Prefix = @() } }
    }
    foreach ($taskBase in $taskRoots) {
        $taskCli = Join-Path $taskBase 'node_modules/pnpm/bin/pnpm.cjs'
        if (Test-Path -LiteralPath $taskCli) { $taskPnpmCandidates += @{ File = $Node; Prefix = @($taskCli) } }
        $taskCli = Join-Path $taskBase 'node_modules/pnpm/bin/pnpm.mjs'
        if (Test-Path -LiteralPath $taskCli) { $taskPnpmCandidates += @{ File = $Node; Prefix = @($taskCli) } }
    }
    foreach ($taskCandidate in $taskPnpmCandidates) {
        $taskArgs = @($taskCandidate.Prefix) + @('--version')
        try {
            $taskVersion = & $taskCandidate.File @taskArgs
            if ($LASTEXITCODE -eq 0 -and ($taskVersion | Out-String).Trim() -eq '11.19.0') {
                return @{ File = $taskCandidate.File; Arguments = @($taskCandidate.Prefix) + @('install', '--frozen-lockfile') }
            }
        } catch { }
    }
    $taskNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($taskNpm) {
        return @{ File = $taskNpm.Source; Arguments = @('exec', '--yes', '--package=pnpm@11.19.0', '--', 'pnpm', 'install', '--frozen-lockfile') }
    }
    foreach ($taskBase in $taskRoots) {
        $taskCli = Join-Path $taskBase 'node_modules/npm/bin/npm-cli.js'
        if (Test-Path -LiteralPath $taskCli) {
            return @{ File = $Node; Arguments = @($taskCli, 'exec', '--yes', '--package=pnpm@11.19.0', '--', 'pnpm', 'install', '--frozen-lockfile') }
        }
    }
    throw "Node found at $Node, but npm or pnpm 11.19.0 was not found in PATH or beside this runtime. Install the official Node.js 24+ distribution including npm, then reopen First Start."
}
