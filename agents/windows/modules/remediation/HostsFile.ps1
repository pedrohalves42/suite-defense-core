<#
.SYNOPSIS
    Phase 4 split of remediation.ps1 — hosts-file blocklist sync.
.DESCRIPTION
    Prefers the hexagonal SyncBlocklistUseCase via $script:Agent.UseCases
    when available (sanitization + adapter-backed atomic writes); falls
    back to legacy direct hosts-file mutation if the container is not
    yet wired (rolling upgrades).
#>

function Invoke-SyncBlockedWebsites {
    param([object]$Payload)

    # Phase 4 cutover: prefer use case path.
    if ($script:Agent -and $script:Agent.UseCases -and $script:Agent.UseCases.SyncBlocklist) {
        try {
            $r = & $script:Agent.UseCases.SyncBlocklist $Payload
            if ($r -and $r.Success) {
                return @{ success = $true; blocked_count = $r.Applied; blocked_domains = $r.Entries; method = "use_case"; synced_at = (Get-Date).ToString("o") }
            }
            Write-Log "[SYNC-BLOCKED] Use-case path returned no-op, falling back to legacy" "DEBUG"
        } catch {
            Write-Log "[SYNC-BLOCKED] Use-case path failed ($($_.Exception.Message)); falling back to legacy" "WARN"
        }
    }

    try {
        Write-Log "[SYNC-BLOCKED] Syncing blocked websites (legacy path)..." "INFO"

        $hostsPath = "C:\Windows\System32\drivers\etc\hosts"
        $markerStart = "# === CyberShield Blocked Websites Start ==="
        $markerEnd   = "# === CyberShield Blocked Websites End ==="

        $urls = @()
        $payloadDomains = $null
        if ($null -ne $Payload) {
            if ($Payload -is [hashtable]) {
                if ($Payload.ContainsKey("blocked_domains")) { $payloadDomains = $Payload["blocked_domains"] }
                elseif ($Payload.ContainsKey("urls"))        { $payloadDomains = $Payload["urls"] }
                elseif ($Payload.ContainsKey("domains"))     { $payloadDomains = $Payload["domains"] }
            } else {
                try {
                    $props = @($Payload.PSObject.Properties | ForEach-Object { $_.Name })
                    if ($props -contains "blocked_domains") { $payloadDomains = $Payload.blocked_domains }
                    elseif ($props -contains "urls")        { $payloadDomains = $Payload.urls }
                    elseif ($props -contains "domains")     { $payloadDomains = $Payload.domains }
                } catch { Write-Log "[SYNC-BLOCKED] Payload property access error (non-fatal): $($_.Exception.Message)" "DEBUG" }
            }
        }
        if ($payloadDomains) { $urls = @($payloadDomains) }
        else {
            $result = Invoke-SecureRequest -Path "/functions/v1/serve-dns-filter" -Method "POST" -Body @{ agent_name = $Global:AgentName; timestamp = [DateTime]::UtcNow.ToString("o") } -MaxRetries 2 -TimeoutSec 15
            if ($result.Success) {
                $response = $result.Content | ConvertFrom-Json
                try {
                    $responseProps = @($response.PSObject.Properties | ForEach-Object { $_.Name })
                    if     ($responseProps -contains "domains")         { $urls = @($response.domains) }
                    elseif ($responseProps -contains "blocked_domains") { $urls = @($response.blocked_domains) }
                } catch { Write-Log "[SYNC-BLOCKED] Response parse error: $($_.Exception.Message)" "WARN" }
            }
        }

        if ($urls.Count -eq 0) { return @{ success = $true; blocked_count = 0; message = "No URLs to block" } }

        $hostsContent = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue
        if ($hostsContent -match [regex]::Escape($markerStart)) {
            $hostsContent = $hostsContent -replace "(?s)$([regex]::Escape($markerStart)).*?$([regex]::Escape($markerEnd))", ""
        }

        $blockEntries = @($markerStart)
        foreach ($url in $urls) {
            $domain = $url -replace "^https?://", "" -replace "/.*$", ""
            # Defense in depth: refuse any domain containing whitespace / control chars.
            if ($domain -notmatch '^[a-zA-Z0-9._-]+$') {
                Write-Log "[SYNC-BLOCKED] Rejected malformed domain: $domain" "WARN"
                continue
            }
            $blockEntries += "0.0.0.0 $domain"
            $blockEntries += "0.0.0.0 www.$domain"
        }
        $blockEntries += $markerEnd

        $newContent = $hostsContent.TrimEnd() + "`r`n" + ($blockEntries -join "`r`n") + "`r`n"
        Set-Content -Path $hostsPath -Value $newContent -Encoding ASCII -Force
        ipconfig /flushdns | Out-Null
        @{ domains = $urls; updated_at = (Get-Date).ToString("o") } | ConvertTo-Json | Out-File $Global:DnsBlocklistPath -Encoding UTF8

        Write-Log "[SYNC-BLOCKED] Blocked $($urls.Count) websites via hosts file" "SUCCESS"
        return @{ success = $true; blocked_count = $urls.Count; blocked_domains = $urls; method = "hosts_file"; synced_at = (Get-Date).ToString("o") }
    } catch {
        Write-Log "[SYNC-BLOCKED] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}
