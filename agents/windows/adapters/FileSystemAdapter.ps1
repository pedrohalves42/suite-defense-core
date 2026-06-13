<#
.SYNOPSIS
    IFileSystem adapter — atomic writes, safe backups.
.DESCRIPTION
    Phase 2 (ADR-002). All writes go through a temp file in the
    same directory and an atomic Move-Item rename to avoid
    half-observed state files (agent_state.json, evidence journal,
    DNS blocklist).
#>

function New-FileSystemAdapter {
    $obj = [PSCustomObject]@{ Kind = 'FileSystem' }

    $obj | Add-Member ScriptMethod Read -Value {
        param([string]$Path)
        if (-not (Test-Path -LiteralPath $Path)) { return $null }
        return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction Stop)
    }

    $obj | Add-Member ScriptMethod Write -Value {
        param([string]$Path, [string]$Body)
        $dir = Split-Path -Parent $Path
        if ($dir -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        $tmp = "$Path.tmp.$([Guid]::NewGuid().ToString('N'))"
        try {
            [System.IO.File]::WriteAllText($tmp, $Body, (New-Object System.Text.UTF8Encoding $false))
            Move-Item -LiteralPath $tmp -Destination $Path -Force -ErrorAction Stop
        } catch {
            if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
            throw
        }
    }

    $obj | Add-Member ScriptMethod Append -Value {
        param([string]$Path, [string]$Line)
        $dir = Split-Path -Parent $Path
        if ($dir -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        Add-Content -LiteralPath $Path -Value $Line -Encoding UTF8 -ErrorAction Stop
    }

    $obj | Add-Member ScriptMethod Exists -Value {
        param([string]$Path)
        return [bool](Test-Path -LiteralPath $Path)
    }

    $obj | Add-Member ScriptMethod Delete -Value {
        param([string]$Path)
        if (Test-Path -LiteralPath $Path) {
            Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
        }
    }

    $obj | Add-Member ScriptMethod Backup -Value {
        param([string]$Path)
        if (-not (Test-Path -LiteralPath $Path)) { return $null }
        $bak = "$Path.bak.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
        Copy-Item -LiteralPath $Path -Destination $bak -Force -ErrorAction Stop
        return $bak
    }

    return $obj
}
