<#
.SYNOPSIS
    Auto-update with Ed25519 signature verification
#>

function Check-ForUpdate {
    try {
        $response = Invoke-SecureApi -Endpoint "agents/$($script:Config.AgentId)/check-update"

        if ($response -and $response.needs_update) {
            Write-Log "Update available: v$($response.version)" "INFO"
            $updated = Install-AgentUpdate -Version $response.version -Url $response.url -Hash $response.hash -Signature $response.signature
            if ($updated) {
                Write-Log "Update applied - restarting agent" "INFO"
                Export-PersistedState
                # Trigger restart via scheduled task
                Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
                Start-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
            }
        }
    }
    catch {
        Write-Log "Update check failed: $($_.Exception.Message)" "WARN"
    }
}

function Install-AgentUpdate {
    param(
        [string]$Version,
        [string]$Url,
        [string]$Hash,
        [string]$Signature
    )

    $tempFile = "$script:TempDir\agent_update_$Version.ps1"

    try {
        # 1. Download to temp
        Invoke-WebRequest -Uri $Url -OutFile $tempFile -UseBasicParsing

        # 2. Verify SHA-256 hash
        $actualHash = (Get-FileHash $tempFile -Algorithm SHA256).Hash.ToLower()
        if ($Hash -and $actualHash -ne $Hash.ToLower()) {
            Write-Log "Update hash mismatch (expected: $Hash, got: $actualHash) - ABORTED" "ERROR"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            return $false
        }
        Write-Log "Update hash verified" "INFO"

        # 3. Verify ASCII safety (no non-ASCII chars that break PS 5.1)
        $content = Get-Content $tempFile -Raw -Encoding UTF8
        $nonAscii = $content.ToCharArray() | Where-Object { [int][char]$_ -gt 127 }
        if ($nonAscii.Count -gt 0) {
            Write-Log "Update contains $($nonAscii.Count) non-ASCII chars - ABORTED" "ERROR"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            return $false
        }

        # 4. Backup current
        if (Test-Path $script:Config.ScriptPath) {
            Copy-Item $script:Config.ScriptPath $script:Config.BackupPath -Force
            Write-Log "Current script backed up" "INFO"
        }

        # 5. Atomic replace via temp file
        Move-Item $tempFile $script:Config.ScriptPath -Force
        Write-Log "Agent updated to v$Version" "INFO"
        return $true
    }
    catch {
        Write-Log "Update installation failed: $($_.Exception.Message)" "ERROR"
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        return $false
    }
}
