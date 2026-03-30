<#
.SYNOPSIS
    Watchdog, TOCTOU self-healing and auto-recovery
#>

$script:FaultCount = 0

function Start-Watchdog {
    Write-Log "Watchdog started (interval: $($script:Config.WatchdogInterval)s)" "INFO"

    while ($true) {
        try {
            # Check script integrity
            $integrityOk = Test-ScriptIntegrity -ScriptPath $script:Config.ScriptPath
            if (-not $integrityOk) {
                Write-Log "Integrity violation detected - initiating recovery" "ERROR"
                $script:FaultCount++

                if ($script:FaultCount -ge 3) {
                    Write-Log "Multiple integrity failures - attempting full recovery" "ERROR"
                    Invoke-AgentRecovery
                    $script:FaultCount = 0
                }
            }
            else {
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

    # BOM-safe hash: strip UTF-8 BOM before hashing
    $rawBytes = [System.IO.File]::ReadAllBytes($ScriptPath)
    if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
        $rawBytes = $rawBytes[3..($rawBytes.Length - 1)]
    }
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha256.ComputeHash($rawBytes)
    $actualHash = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""

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
        Copy-Item $script:Config.BackupPath $script:Config.ScriptPath -Force

        if (Test-ScriptIntegrity -ScriptPath $script:Config.ScriptPath) {
            Write-Log "Backup restoration successful" "INFO"
            return $true
        }
    }

    # Download fresh copy from server
    Write-Log "Downloading fresh agent script" "INFO"
    try {
        $tempFile = "$script:TempDir\recovery_agent.ps1"
        $response = Invoke-SecureApi -Endpoint "serve-agent-update" -Method "GET"

        if ($response -and $response.script_content) {
            $response.script_content | Out-File $tempFile -Encoding UTF8 -Force

            # Verify hash
            if ($response.script_hash) {
                $downloadHash = Get-PayloadHash -Payload (Get-Content $tempFile -Raw)
                if ($downloadHash -ne $response.script_hash) {
                    Write-Log "Downloaded script hash mismatch - recovery aborted" "ERROR"
                    return $false
                }
            }

            Copy-Item $script:Config.ScriptPath $script:Config.BackupPath -Force -ErrorAction SilentlyContinue
            Move-Item $tempFile $script:Config.ScriptPath -Force
            Write-Log "Recovery download successful" "INFO"
            return $true
        }
    }
    catch {
        Write-Log "Recovery download failed: $($_.Exception.Message)" "ERROR"
    }

    return $false
}
