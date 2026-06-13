<#
.SYNOPSIS
    Adapter for the Windows hosts file with sanitization + backup.
.DESCRIPTION
    Phase 2 (ADR-002). Encapsulates all edits to
    %SystemRoot%\System32\drivers\etc\hosts. Every entry is validated
    (IPv4/IPv6 + DNS-name regex, no embedded CR/LF) before being
    written, and the original file is backed up to .bak.<unixtime>
    before any modification.

    Block region is delimited by # >>> CyberShield managed >>> ...
    # <<< CyberShield managed <<< so we can replace it idempotently
    without trampling user-authored entries.
#>

$script:HostsBeginMarker = '# >>> CyberShield managed >>>'
$script:HostsEndMarker   = '# <<< CyberShield managed <<<'

function New-HostsFileAdapter {
    param(
        [string]$Path = "$env:SystemRoot\System32\drivers\etc\hosts",
        $Fs = $null,
        $Logger = $null
    )

    if (-not $Fs) {
        if (Get-Command New-FileSystemAdapter -ErrorAction SilentlyContinue) {
            $Fs = New-FileSystemAdapter
        }
    }

    $state = [PSCustomObject]@{
        Path   = $Path
        Fs     = $Fs
        Logger = $Logger
    }

    $sanitize = {
        param($entries)
        $ipRx   = '^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)$'
        $nameRx = '^[A-Za-z0-9]([A-Za-z0-9\-\.]{0,253}[A-Za-z0-9])?$'
        $clean  = New-Object System.Collections.ArrayList
        foreach ($e in $entries) {
            if ($null -eq $e) { continue }
            $ip   = "$($e.Ip)".Trim()
            $name = "$($e.Hostname)".Trim()
            if ($ip   -match "[\r\n\t]") { continue }
            if ($name -match "[\r\n\t]") { continue }
            if ($ip   -notmatch $ipRx)   { continue }
            if ($name -notmatch $nameRx) { continue }
            [void]$clean.Add("$ip`t$name")
        }
        return $clean
    }

    $state | Add-Member ScriptMethod Read -Value {
        if (-not (Test-Path -LiteralPath $this.Path)) { return '' }
        return (Get-Content -LiteralPath $this.Path -Raw -Encoding UTF8)
    }

    $state | Add-Member ScriptMethod ApplyBlock -Value {
        param([object[]]$Entries)
        $clean = & $sanitize $Entries
        $original = if (Test-Path -LiteralPath $this.Path) { Get-Content -LiteralPath $this.Path -Raw -Encoding UTF8 } else { '' }

        # Strip prior managed block
        $stripped = [regex]::Replace(
            $original,
            "(?ms)" + [regex]::Escape($script:HostsBeginMarker) + ".*?" + [regex]::Escape($script:HostsEndMarker) + "\r?\n?",
            ''
        ).TrimEnd("`r","`n")

        $block = @($script:HostsBeginMarker) + @($clean) + @($script:HostsEndMarker)
        $final = ($stripped + "`r`n" + ($block -join "`r`n") + "`r`n")

        # Backup then atomic write
        if ($this.Fs -and (Test-Path -LiteralPath $this.Path)) {
            try { [void]$this.Fs.Backup($this.Path) } catch {}
        }
        if ($this.Fs) {
            $this.Fs.Write($this.Path, $final)
        } else {
            $tmp = "$($this.Path).tmp.$([Guid]::NewGuid().ToString('N'))"
            [System.IO.File]::WriteAllText($tmp, $final, (New-Object System.Text.UTF8Encoding $false))
            Move-Item -LiteralPath $tmp -Destination $this.Path -Force
        }
        if ($this.Logger) { $this.Logger.Info("Hosts file updated with $($clean.Count) sanitized entries") }
        return $clean.Count
    }

    $state | Add-Member ScriptMethod ClearBlock -Value {
        if (-not (Test-Path -LiteralPath $this.Path)) { return }
        $original = Get-Content -LiteralPath $this.Path -Raw -Encoding UTF8
        $stripped = [regex]::Replace(
            $original,
            "(?ms)" + [regex]::Escape($script:HostsBeginMarker) + ".*?" + [regex]::Escape($script:HostsEndMarker) + "\r?\n?",
            ''
        )
        if ($this.Fs) {
            try { [void]$this.Fs.Backup($this.Path) } catch {}
            $this.Fs.Write($this.Path, $stripped)
        }
        if ($this.Logger) { $this.Logger.Info('Hosts file managed block cleared') }
    }

    return $state
}
