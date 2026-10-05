param([switch]$NoBrowser)
# Backward-compatible launcher name.
& (Join-Path $PSScriptRoot 'Start-Amadeus.ps1') @PSBoundParameters
