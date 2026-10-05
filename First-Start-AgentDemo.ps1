param([switch]$NoBrowser, [switch]$SetupOnly)
# Backward-compatible launcher name.
& (Join-Path $PSScriptRoot 'First-Start-Amadeus.ps1') @PSBoundParameters
