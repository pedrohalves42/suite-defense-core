<#
.SYNOPSIS
    Agent auto-update with download-verify-execute pattern.
    v6.0: TOCTOU guard via $Global:UpdateInProgress, BOM-safe hashing,
    ASCII safety check, atomic replace.
#>

function Test-AgentVersion {
    <#
    .SYNOPSIS
        Compare local version against server-reported latest.
        Returns $true if update is needed.
    #>
    param(
        [string]$ServerVersion
    )

    if (-not $ServerVersion) { return $false }

    try {
        $local = [Version]$script:Config.Version
        $remote = [Version]$ServerVersion

        if ($remote.Major -gt $local.Major -or $remote.Minor -gt $local.Minor) {
            Write-Log "Version lag detected: local=$($script:Config.Version) server=$ServerVersion" "WARN"
            return $true
        }

        if ($remote.Build -gt $local.Build) {
            return $true
        }

        return $false
    }
    catch {
        Write-Log "Version comparison failed: $($_.Exception.Message)" "WARN"
        return $false
    }
}

function Invoke-CheckForUpdate {
    <#
    .SYNOPSIS
        Query the server for available updates and apply if needed.
        Uses download-verify-execute pattern per security standard.
    #>
    try {
        $response = Invoke-SecureApi -Endpoint "agents/$($script:Config.AgentId)/check-update"

        if ($response -and $response.needs_update) {
            Write-Log "Update available: v$($response.version)" "INFO"
            $updated = Install-AgentUpdate `
                -Version $response.version `
                -Url $response.url `
                -Hash $response.hash `
                -Signature $response.signature
            if ($updated) {
                Write-Log "Update applied to v$($response.version) - restarting agent" "INFO"
                Export-PersistedState
                # Trigger restart via scheduled task
                Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                Start-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
            }
        }
    }
    catch {
        Write-Log "Update check failed: $($_.Exception.Message)" "WARN"
    }
}

function Install-AgentUpdate {
    <#
    .SYNOPSIS
        Download, verify, and install an agent update.
        Follows download-verify-execute pattern:
        1. Download to temp
        2. Verify SHA-256 hash
        3. Verify ASCII safety
        4. Backup current
        5. Atomic replace with TOCTOU guard
    #>
    param(
        [string]$Version,
        [string]$Url,
        [string]$Hash,
        [string]$Signature
    )

    $tempFile = "$script:TempDir\agent_update_$Version`_$(Get-Random).ps1"

    try {
        # 1. Download to temp directory
        Write-Log "Downloading update v$Version from server..." "INFO"
        Invoke-WebRequest -Uri $Url -OutFile $tempFile -UseBasicParsing -TimeoutSec 60

        if (-not (Test-Path $tempFile)) {
            Write-Log "Download failed - temp file not created" "ERROR"
            return $false
        }

        # 2. Verify SHA-256 hash (BOM-safe)
        if ($Hash) {
            $actualHash = Get-BOMSafeFileHash -FilePath $tempFile
            if ($actualHash -ne $Hash.ToLower()) {
                Write-Log "Update hash mismatch (expected: $Hash, got: $actualHash) - ABORTED" "ERROR"
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                return $false
            }
            Write-Log "Update hash verified" "INFO"
        }
        else {
            Write-Log "No hash provided for update - proceeding with caution" "WARN"
        }

        # 3. Verify ASCII safety (prevent PS 5.1 encoding issues)
        $content = Get-Content $tempFile -Raw -Encoding UTF8
        $nonAscii = $content.ToCharArray() | Where-Object { [int][char]$_ -gt 127 }
        if ($nonAscii.Count -gt 0) {
            Write-Log "Update contains $($nonAscii.Count) non-ASCII chars - ABORTED" "ERROR"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            return $false
        }

        # 4. Backup current script
        if (Test-Path $script:Config.ScriptPath) {
            Copy-Item $script:Config.ScriptPath $script:Config.BackupPath -Force
            Write-Log "Current script backed up" "INFO"
        }

        # 5. Atomic replace with TOCTOU guard
        try {
            $Global:UpdateInProgress = $true
            Move-Item $tempFile $script:Config.ScriptPath -Force

            # Update hash cache after successful replacement
            $newHash = Get-BOMSafeFileHash -FilePath $script:Config.ScriptPath
            @{ hash = $newHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File "$script:DataDir\expected_script_hash.json" -Encoding UTF8 -Force
            $Global:BootScriptHash = $newHash

            Write-Log "Agent updated to v$Version" "INFO"
            return $true
        }
        finally {
            $Global:UpdateInProgress = $false
        }
    }
    catch {
        Write-Log "Update installation failed: $($_.Exception.Message)" "ERROR"
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        return $false
    }
}
