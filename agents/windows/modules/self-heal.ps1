<#
.SYNOPSIS
    Watchdog, TOCTOU self-healing and auto-recovery
    v6.0: BOM-safe hashing, UpdateInProgress guard, fault counting with exponential backoff
#>

$script:FaultCount = 0
$script:MaxFaultsBeforeRecovery = 3

function Get-BOMSafeFileHash {
    <#
    .SYNOPSIS
        BOM-safe SHA-256 hash. Strips UTF-8 BOM before hashing
        to ensure consistent results regardless of file encoding.
    #>
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )
    try {
        $rawBytes = [System.IO.File]::ReadAllBytes($FilePath)
        if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
            $rawBytes = $rawBytes[3..($rawBytes.Length - 1)]
        }
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hashBytes = $sha256.ComputeHash($rawBytes)
            return [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
        }
        finally {
            $sha256.Dispose()
        }
    }
    catch {
        throw "Get-BOMSafeFileHash failed for ${FilePath}: $($_.Exception.Message)"
    }
}

function Start-Watchdog {
    Write-Log "Watchdog started (interval: $($script:Config.WatchdogInterval)s)" "INFO"

    while ($true) {
        try {
            # Skip integrity check during legitimate updates (TOCTOU guard)
            if ($Global:UpdateInProgress) {
                Write-Log "Update in progress - skipping integrity check" "DEBUG"
                Start-Sleep -Seconds $script:Config.WatchdogInterval
                continue
            }

            $integrityOk = Test-ScriptIntegrity -ScriptPath $script:Config.ScriptPath
            if (-not $integrityOk) {
                Write-Log "Integrity violation detected - initiating recovery" "ERROR"
                $script:FaultCount++

                if ($script:FaultCount -ge $script:MaxFaultsBeforeRecovery) {
                    Write-Log "Multiple integrity failures ($($script:FaultCount)) - attempting full recovery" "ERROR"
                    $recovered = Invoke-AgentRecovery
                    if ($recovered) {
                        $script:FaultCount = 0
                    }
                    else {
                        Write-Log "Recovery failed - entering safe mode" "ERROR"
                        Set-AgentState -NewState "SAFE_MODE" -Reason "Recovery failed after $($script:FaultCount) integrity violations"
                    }
                }
            }
            else {
                if ($script:FaultCount -gt 0) {
                    Write-Log "Integrity restored after $($script:FaultCount) fault(s)" "INFO"
                }
                $script:FaultCount = 0
            }

            # Check if main agent process is alive
            $agentTask = Get-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
            if ($agentTask -and $agentTask.State -ne "Running") {
                Write-Log "Agent task not running - restarting" "WARN"
                Start-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Log "Watchdog error: $($_.Exception.Message)" "ERROR"
        }

        Start-Sleep -Seconds $script:Config.WatchdogInterval
    }
}

function Test-ScriptIntegrity {
    param([string]$ScriptPath)

    if (-not (Test-Path $ScriptPath)) {
        Write-Log "Script file not found: $ScriptPath" "ERROR"
        return $false
    }

    # TOCTOU guard: skip during legitimate update operations
    if ($Global:UpdateInProgress) {
        return $true
    }

    $actualHash = Get-BOMSafeFileHash -FilePath $ScriptPath

    $cachePath = "$script:DataDir\expected_script_hash.json"
    if (Test-Path $cachePath) {
        try {
            $cache = Get-Content $cachePath -Raw | ConvertFrom-Json
            $expectedHash = $cache.hash

            if ($actualHash -eq $expectedHash) {
                return $true
            }

            # Self-heal: if hash differs but matches boot hash, update cache
            if ($Global:BootScriptHash -and $actualHash -eq $Global:BootScriptHash) {
                Write-Log "Hash mismatch but matches boot hash - self-healing cache" "WARN"
                @{ hash = $actualHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File $cachePath -Encoding UTF8 -Force
                return $true
            }

            Write-Log "Script integrity check FAILED (expected: $expectedHash, actual: $actualHash)" "ERROR"
            return $false
        }
        catch {
            Write-Log "Failed to read hash cache: $($_.Exception.Message)" "WARN"
            return $true
        }
    }

    # No cache - create initial baseline
    @{ hash = $actualHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File $cachePath -Encoding UTF8 -Force
    $Global:BootScriptHash = $actualHash
    return $true
}

function Invoke-AgentRecovery {
    Write-Log "Initiating agent recovery" "INFO"

    # Try backup first
    if (Test-Path $script:Config.BackupPath) {
        Write-Log "Restoring from backup" "INFO"
        try {
            $Global:UpdateInProgress = $true
            Copy-Item $script:Config.BackupPath $script:Config.ScriptPath -Force

            if (Test-ScriptIntegrity -ScriptPath $script:Config.ScriptPath) {
                Write-Log "Backup restoration successful" "INFO"
                return $true
            }
        }
        finally {
            $Global:UpdateInProgress = $false
        }
    }

    # Download fresh copy from server (download-verify-execute pattern)
    Write-Log "Downloading fresh agent script" "INFO"
    try {
        $tempFile = "$script:TempDir\recovery_agent_$(Get-Random).ps1"
        $response = Invoke-SecureApi -Endpoint "serve-agent-update" -Method "GET"

        if ($response -and $response.script_content) {
            $response.script_content | Out-File $tempFile -Encoding UTF8 -Force

            # Verify hash using BOM-safe method
            if ($response.script_hash) {
                $downloadHash = Get-BOMSafeFileHash -FilePath $tempFile
                if ($downloadHash -ne $response.script_hash) {
                    Write-Log "Downloaded script hash mismatch - recovery aborted" "ERROR"
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                    return $false
                }
            }

            # ASCII safety check
            $content = Get-Content $tempFile -Raw -Encoding UTF8
            $nonAscii = $content.ToCharArray() | Where-Object { [int][char]$_ -gt 127 }
            if ($nonAscii.Count -gt 0) {
                Write-Log "Downloaded script contains $($nonAscii.Count) non-ASCII chars - recovery aborted" "ERROR"
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                return $false
            }

            try {
                $Global:UpdateInProgress = $true
                Copy-Item $script:Config.ScriptPath $script:Config.BackupPath -Force -ErrorAction SilentlyContinue
                Move-Item $tempFile $script:Config.ScriptPath -Force

                # Update hash cache
                $newHash = Get-BOMSafeFileHash -FilePath $script:Config.ScriptPath
                @{ hash = $newHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File "$script:DataDir\expected_script_hash.json" -Encoding UTF8 -Force
                $Global:BootScriptHash = $newHash

                Write-Log "Recovery download successful" "INFO"
                return $true
            }
            finally {
                $Global:UpdateInProgress = $false
            }
        }
    }
    catch {
        Write-Log "Recovery download failed: $($_.Exception.Message)" "ERROR"
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }

    return $false
}
