<#
.SYNOPSIS
    Agent auto-update with download-verify-execute pattern.
    v7.0: Added Ed25519 signature verification (SSA-004).
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
        2.5. Verify Ed25519 signature (SSA-004)
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

        # 2.5. Verify Ed25519 signature (SSA-004)
        if ($Signature -and $Signature.Length -gt 10) {
            # Signature provided — must verify
            $ed25519Available = Test-Ed25519Available
            if ($ed25519Available -and $Global:Ed25519PublicKeyBase64) {
                $sigValid = Test-Ed25519Signature -ContentHash $actualHash -SignatureBase64 $Signature
                if (-not $sigValid) {
                    Write-Log "Update REJECTED - Ed25519 signature INVALID! Possible supply chain attack. Hash: $actualHash" "ERROR"
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                    return $false
                }
                Write-Log "Ed25519 signature verified for update v$Version" "INFO"
            }
            elseif (-not $Global:Ed25519PublicKeyBase64) {
                # No public key configured — audit-only mode (accept with warning)
                Write-Log "Ed25519 public key not configured - accepting update based on SHA-256 only (audit-only)" "WARN"
            }
            else {
                # Ed25519 not available on this runtime (.NET < 5) — accept with warning
                Write-Log "Ed25519 not available on this runtime - accepting update based on SHA-256 only (PS 5.1 compat)" "WARN"
            }
        }
        elseif ($Global:Ed25519PublicKeyBase64 -and (Test-Ed25519Available)) {
            # No signature but Ed25519 is configured — reject unsigned updates (fail-closed)
            Write-Log "Update REJECTED - No cryptographic signature on update payload. Unsigned updates blocked (SSA-004)." "ERROR"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            return $false
        }
        else {
            # Legacy mode: no signature, no Ed25519 configured — accept with SHA-256 only
            Write-Log "No signature provided and Ed25519 not configured - accepting update based on SHA-256 only" "WARN"
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
