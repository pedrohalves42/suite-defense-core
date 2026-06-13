<#
.SYNOPSIS
    Phase 4 split of remediation.ps1 — quarantine + Windows Update patching.
#>

function Invoke-QuarantineAgent {
    param([object]$Payload)

    try {
        $action = if ($Payload.action -eq "release") { "release" } else { "quarantine" }
        Write-Log "[QUARANTINE] Action: $action" "WARN"

        $ruleName = "CyberShield-Quarantine"
        $serverHost = ([System.Uri]$Global:ServerUrl).Host

        if ($action -eq "quarantine") {
            New-NetFirewallRule -DisplayName "$ruleName-BlockAll" -Direction Outbound -Action Block -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            $serverIPs = [System.Net.Dns]::GetHostAddresses($serverHost) | ForEach-Object { $_.IPAddressToString }
            foreach ($ip in $serverIPs) {
                New-NetFirewallRule -DisplayName "$ruleName-AllowServer-$ip" -Direction Outbound -Action Allow -RemoteAddress $ip -Protocol TCP -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            }
            New-NetFirewallRule -DisplayName "$ruleName-AllowDNS" -Direction Outbound -Action Allow -RemotePort 53 -Protocol UDP -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            Write-Log "[QUARANTINE] Agent quarantined - only server communication allowed" "WARN"
            return @{ success = $true; action = "quarantined"; server_host = $serverHost; server_ips = $serverIPs; reason = $Payload.reason; quarantined_at = (Get-Date).ToString("o") }
        } else {
            Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
            Write-Log "[QUARANTINE] Agent released from quarantine" "SUCCESS"
            return @{ success = $true; action = "released"; released_at = (Get-Date).ToString("o") }
        }
    } catch {
        Write-Log "[QUARANTINE] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-ApplySecurityPatch {
    param([object]$Payload)

    try {
        Write-Log "[PATCH] Applying security patch..." "INFO"
        $kbId  = $Payload.kb_id
        $cveId = $Payload.cve_id

        if ($kbId) {
            $installed = Get-HotFix -Id $kbId -ErrorAction SilentlyContinue
            if ($installed) {
                Write-Log "[PATCH] KB $kbId already installed" "INFO"
                return @{ success = $true; status = "already_installed"; kb_id = $kbId; installed_on = $installed.InstalledOn.ToString("o") }
            }

            try {
                $session = New-Object -ComObject Microsoft.Update.Session
                $searcher = $session.CreateUpdateSearcher()
                $searchResult = $searcher.Search("IsInstalled=0 AND Type='Software'")

                $targetUpdate = $null
                foreach ($update in $searchResult.Updates) {
                    foreach ($kb in $update.KBArticleIDs) {
                        if ("KB$kb" -eq $kbId -or $kb -eq ($kbId -replace "^KB", "")) { $targetUpdate = $update; break }
                    }
                    if ($targetUpdate) { break }
                }

                if ($targetUpdate) {
                    $updatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
                    $updatesToInstall.Add($targetUpdate) | Out-Null
                    $downloader = $session.CreateUpdateDownloader()
                    $downloader.Updates = $updatesToInstall
                    $downloadResult = $downloader.Download()
                    $installer = $session.CreateUpdateInstaller()
                    $installer.Updates = $updatesToInstall
                    $installResult = $installer.Install()

                    Write-Log "[PATCH] KB $kbId installed successfully (reboot: $($installResult.RebootRequired))" "SUCCESS"
                    return @{ success = $true; status = "installed"; kb_id = $kbId; reboot_required = $installResult.RebootRequired; patched_at = (Get-Date).ToString("o") }
                } else {
                    Write-Log "[PATCH] KB $kbId not found in available updates" "WARN"
                    return @{ success = $false; status = "not_found"; kb_id = $kbId; message = "Update not available via Windows Update" }
                }
            } catch {
                Write-Log "[PATCH] Windows Update COM failed: $($_.Exception.Message)" "WARN"
                return @{ success = $false; status = "wu_error"; error = $_.Exception.Message }
            }
        }

        return @{ success = $false; error = "No kb_id specified" }
    } catch {
        Write-Log "[PATCH] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}
