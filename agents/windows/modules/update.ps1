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
        v7.1: Passes expected_sha256 and signature_timestamp for Phase 3 validation.
    #>
    try {
        $response = Invoke-SecureApi -Endpoint "agents/$($script:Config.AgentId)/check-update"

        if ($response -and $response.needs_update) {
            Write-Log "Update available: v$($response.version)" "INFO"

            # Phase 3: extract optional integrity fields (backward-compatible)
            $expectedSha256 = if ($response.PSObject.Properties['expected_sha256']) { $response.expected_sha256 } else { $null }
            $signatureTimestamp = if ($response.PSObject.Properties['signature_timestamp']) { $response.signature_timestamp } else { $null }

            $updated = Install-AgentUpdate `
                -Version $response.version `
                -Url $response.url `
                -Hash $response.hash `
                -Signature $response.signature `
                -ExpectedSha256 $expectedSha256 `
                -SignatureTimestamp $signatureTimestamp
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
        2.5. Phase 3: Cross-validate expected_sha256 from server
        2.6. Verify Ed25519 signature (SSA-004)
        2.7. Phase 3: Reject stale signatures (signature_timestamp check)
        3. Verify ASCII safety
        4. Backup current
        5. Atomic replace with TOCTOU guard
    #>
    param(
        [string]$Version,
        [string]$Url,
        [string]$Hash,
        [string]$Signature,
        [string]$ExpectedSha256,
        [string]$SignatureTimestamp
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
                $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
                return $false
            }
            Write-Log "Update hash verified" "INFO"
        }
        else {
            Write-Log "No hash provided for update - proceeding with caution" "WARN"
        }

        # 2.5. Phase 3: Cross-validate expected_sha256 from server (defense in depth)
        if ($ExpectedSha256 -and $actualHash) {
            if ($actualHash -ne $ExpectedSha256.ToLower()) {
                Write-Log "FATAL: expected_sha256 from server does NOT match downloaded content hash! Possible MITM or replay attack. (server=$ExpectedSha256, local=$actualHash) - ABORTED" "ERROR"
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
                return $false
            }
            Write-Log "Phase 3: expected_sha256 cross-validated OK" "INFO"
        }

        # 2.6. Verify Ed25519 signature (SSA-004)
        if ($Signature -and $Signature.Length -gt 10) {
            # Signature provided — must verify
            $ed25519Available = Test-Ed25519Available
            if ($ed25519Available -and $Global:Ed25519PublicKeyBase64) {
                $sigValid = Test-Ed25519Signature -ContentHash $actualHash -SignatureBase64 $Signature
                if (-not $sigValid) {
                    Write-Log "Update REJECTED - Ed25519 signature INVALID! Possible supply chain attack. Hash: $actualHash" "ERROR"
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                    $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
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
            $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
            return $false
        }
        else {
            # Legacy mode: no signature, no Ed25519 configured — accept with SHA-256 only
            Write-Log "No signature provided and Ed25519 not configured - accepting update based on SHA-256 only" "WARN"
        }

        # 2.7. Phase 3: Reject stale signatures (defense in depth)
        if ($SignatureTimestamp) {
            try {
                $sigTime = [DateTime]::Parse($SignatureTimestamp).ToUniversalTime()
                $lastUpdateFile = "$script:DataDir\last_successful_update.json"
                if (Test-Path $lastUpdateFile) {
                    $lastUpdateData = Get-Content $lastUpdateFile -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
                    if ($lastUpdateData -and $lastUpdateData.timestamp) {
                        $lastTime = [DateTime]::Parse($lastUpdateData.timestamp).ToUniversalTime()
                        if ($sigTime -le $lastTime) {
                            Write-Log "Phase 3: STALE signature detected (sig=$sigTime <= lastUpdate=$lastTime). Possible replay attack - ABORTED" "ERROR"
                            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                            $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
                            return $false
                        }
                    }
                }
                Write-Log "Phase 3: Signature timestamp validated ($sigTime)" "INFO"
            }
            catch {
                Write-Log "Phase 3: Could not parse signature_timestamp '$SignatureTimestamp' - continuing (non-blocking)" "WARN"
            }
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

            # Phase 3: Record successful update timestamp for stale signature detection
            @{ timestamp = (Get-Date).ToUniversalTime().ToString("o"); version = $Version; sha256 = $newHash } | ConvertTo-Json | Out-File "$script:DataDir\last_successful_update.json" -Encoding UTF8 -Force

            # Reset TOCTOU failure counter on success
            $Global:ToctouFailures = 0

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
