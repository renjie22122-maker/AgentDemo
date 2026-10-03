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
    throw 'Node.js 24+ is required. Install it from https://nodejs.org or run: winget install OpenJS.NodeJS.LTS . Then reopen First-Start-AgentDemo.cmd.'
}
