<#
.SYNOPSIS
    CyberShield Agent v6.0 - Evidence Chain & Aggregation Module
.DESCRIPTION
    Evidence buffer management, aggregation engine with burst detection.
    Depends on: utils.ps1, network.ps1 (Invoke-SecureRequest), notification.ps1 (Invoke-PushAlert)
#>

function Add-EvidenceEntry {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Type,
        
        [Parameter(Mandatory = $false)]
        $Data = @{},
        
        [Parameter(Mandatory = $false)]
        [string]$Severity = "info"
    )
    try {
        $entry = @{
            timestamp     = (Get-Date).ToUniversalTime().ToString("o")
            type          = $Type
            data          = $Data
            severity      = $Severity
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
        
        $Global:EvidenceBuffer.Add($entry) | Out-Null
        
        $journalLine = ($entry | ConvertTo-Json -Compress -Depth 5)
        Add-Content -Path $Global:EvidenceJournalPath -Value $journalLine -Encoding UTF8 -ErrorAction SilentlyContinue
        
        if ($Global:EvidenceBuffer.Count -ge 10) {
            Invoke-FlushEvidence
        }
    } catch {
        Write-Log "[EVIDENCE] Failed to add entry: $($_.Exception.Message)" "WARN"
    }
}

function Invoke-FlushEvidence {
    try {
        if ($Global:EvidenceBuffer.Count -eq 0) { return }
        
        $entries = @($Global:EvidenceBuffer)
        $Global:EvidenceBuffer.Clear()
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body @{
                agent_name = $Global:AgentName
                entries    = $entries
            }
        
        if ($result.Success) {
            Write-Log "[EVIDENCE] Flushed $($entries.Count) entries to backend" "DEBUG"
        } else {
            Write-Log "[EVIDENCE] Flush failed: $($result.Error) - entries saved to journal" "WARN"
        }
    } catch {
        Write-Log "[EVIDENCE] Flush error: $($_.Exception.Message)" "WARN"
    }
}

function Add-AggregatedEvent {
    param(
        [Parameter(Mandatory = $true)][string]$EventType,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $false)][hashtable]$Metadata = @{}
    )

    if (-not $Global:AggregationEnabled) {
        Add-EvidenceEntry -Type "raw_event" -Data @{
            event_type = $EventType
            pattern    = $Pattern
            metadata   = $Metadata
        }
        return
    }

    $Global:AggregationStats.events_received++
    $now = if ($Global:LoopTimestamp) { $Global:LoopTimestamp } else { Get-Date }
    $key = "${EventType}:${Pattern}"

    if ($Global:EventAggregationBuffer.ContainsKey($key)) {
        $entry = $Global:EventAggregationBuffer[$key]
        $windowAge = ($now - $entry.first_seen).TotalSeconds

        if ($windowAge -le $Global:AggregationWindowSeconds) {
            $entry.count++
            $entry.last_seen = $now
            $Global:AggregationStats.events_aggregated++

            $threshold = switch -Wildcard ($EventType) {
                "file_*"    { $Global:AggregationFileThreshold }
                "process_*" { $Global:AggregationProcessThreshold }
                "network_*" { $Global:AggregationNetworkThreshold }
                default     { $Global:AggregationFileThreshold }
            }

            if ($entry.count -eq $threshold -and -not $entry.burst_alerted) {
                $entry.burst_alerted = $true
                $Global:AggregationStats.bursts_detected++
                $burstType = switch -Wildcard ($EventType) {
                    "file_rename"     { "possible_ransomware_burst" }
                    "file_delete"     { "mass_file_deletion" }
                    "network_connect" { "possible_port_scan" }
                    "process_spawn"   { "process_spawn_flood" }
                    default           { "event_burst" }
                }
                Write-Log "[AGGREGATION] BURST DETECTED: $burstType - $($entry.count) events of type '$EventType' pattern '$Pattern' in ${windowAge}s" "ERROR"

                Invoke-PushAlert `
                    -AlertType $burstType `
                    -AlertMessage "Event burst detected on $env:COMPUTERNAME : $($entry.count)x $EventType ($Pattern) in ${windowAge}s" `
                    -Severity "critical" `
                    -Details @{
                        event_type     = $EventType
                        pattern        = $Pattern
                        count          = $entry.count
                        window_seconds = $windowAge
                        first_seen     = $entry.first_seen.ToString("o")
                    }
            }
            return
        } else {
            Invoke-FlushAggregatedEntry -Key $key -Entry $entry
        }
    }

    $Global:EventAggregationBuffer[$key] = @{
        event_type    = $EventType
        pattern       = $Pattern
        count         = 1
        first_seen    = $now
        last_seen     = $now
        metadata      = $Metadata
        burst_alerted = $false
    }

    if ($Metadata) {
        try {
            $metaJson = $Metadata | ConvertTo-Json -Compress -Depth 3 -ErrorAction SilentlyContinue
            if ($metaJson -and $metaJson.Length -gt 10240) {
                Write-Log "[AGGREGATION] Entry metadata too large ($($metaJson.Length) chars) - truncating" "WARN"
                $Metadata = @{ truncated = $true; original_size = $metaJson.Length }
            }
        } catch { }
    }

    if ($Global:EventAggregationBuffer.Count -ge [int]($Global:AggregationMaxBufferSize * 0.8)) {
        Write-Log "[AGGREGATION] Buffer at 80% ($($Global:EventAggregationBuffer.Count)/$($Global:AggregationMaxBufferSize)) - preemptive flush" "WARN"
        Invoke-FlushAggregationBuffer
    }

    if ($Global:EventAggregationBuffer.Count -ge $Global:AggregationMaxBufferSize) {
        Write-Log "[AGGREGATION] Buffer FULL ($($Global:EventAggregationBuffer.Count)) - forcing flush" "WARN"
        $Global:AggregationStats.buffer_overflow++
        Invoke-FlushAggregationBuffer
    }
}

function Invoke-FlushAggregatedEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][hashtable]$Entry
    )

    try {
        $duration = ($Entry.last_seen - $Entry.first_seen).TotalSeconds
        $severity = if ($Entry.burst_alerted) { "critical" } elseif ($Entry.count -gt 10) { "warning" } else { "info" }

        Add-EvidenceEntry -Type "aggregated_event" -Data @{
            event_type       = $Entry.event_type
            pattern          = $Entry.pattern
            count            = $Entry.count
            first_seen       = $Entry.first_seen.ToString("o")
            last_seen        = $Entry.last_seen.ToString("o")
            duration_seconds = [math]::Round($duration, 2)
            burst_detected   = $Entry.burst_alerted
            metadata         = $Entry.metadata
        } -Severity $severity

        $Global:AggregationStats.events_sent++
    } catch {
        Write-Log "[AGGREGATION] Flush entry error: $($_.Exception.Message)" "WARN"
    }
}

function Invoke-FlushAggregationBuffer {
    try {
        $flushed = 0
        $keys = @($Global:EventAggregationBuffer.Keys)

        if ($keys.Count -gt $Global:AggregationMaxBufferSize) {
            $overflow = $keys.Count - $Global:AggregationMaxBufferSize
            $Global:AggregationStats.buffer_overflow += $overflow
            Write-Log "[AGGREGATION] Buffer overflow: dropping $overflow oldest entries" "WARN"
            $sorted = $keys | Sort-Object { $Global:EventAggregationBuffer[$_].last_seen }
            $toDrop = $sorted | Select-Object -First $overflow
            foreach ($dk in $toDrop) {
                $Global:EventAggregationBuffer.Remove($dk)
            }
            $keys = @($Global:EventAggregationBuffer.Keys)
        }

        foreach ($key in $keys) {
            $entry = $Global:EventAggregationBuffer[$key]
            if ($entry.count -gt 0) {
                Invoke-FlushAggregatedEntry -Key $key -Entry $entry
                $flushed++
            }
        }

        $Global:EventAggregationBuffer.Clear()
        $Global:AggregationLastFlush = Get-Date

        if ($flushed -gt 0) {
            $total = $Global:AggregationStats.events_received
            $sent = $Global:AggregationStats.events_sent
            if ($total -gt 0) {
                $Global:AggregationStats.reduction_percent = [math]::Round((1 - ($sent / $total)) * 100, 1)
            }
            Write-Log "[AGGREGATION] Flushed $flushed aggregated entries (reduction: $($Global:AggregationStats.reduction_percent)%)" "INFO"
        }
    } catch {
        Write-Log "[AGGREGATION] Buffer flush error: $($_.Exception.Message)" "WARN"
    }
}

function Update-AggregationConfig {
    param([Parameter(Mandatory = $true)][hashtable]$Config)

    try {
        if ($null -ne $Config.enabled) {
            $Global:AggregationEnabled = [bool]$Config.enabled
        }
        if ($null -ne $Config.window_seconds -and $Config.window_seconds -ge 1 -and $Config.window_seconds -le 30) {
            $Global:AggregationWindowSeconds = [int]$Config.window_seconds
        }
        if ($null -ne $Config.file_threshold -and $Config.file_threshold -ge 5 -and $Config.file_threshold -le 10000) {
            $Global:AggregationFileThreshold = [int]$Config.file_threshold
        }
        if ($null -ne $Config.process_threshold -and $Config.process_threshold -ge 5 -and $Config.process_threshold -le 5000) {
            $Global:AggregationProcessThreshold = [int]$Config.process_threshold
        }
        if ($null -ne $Config.network_threshold -and $Config.network_threshold -ge 5 -and $Config.network_threshold -le 50000) {
            $Global:AggregationNetworkThreshold = [int]$Config.network_threshold
        }
        if ($null -ne $Config.max_buffer_size -and $Config.max_buffer_size -ge 50 -and $Config.max_buffer_size -le 5000) {
            $Global:AggregationMaxBufferSize = [int]$Config.max_buffer_size
        }
        Write-Log "[AGGREGATION] Config updated: enabled=$($Global:AggregationEnabled) window=${Global:AggregationWindowSeconds}s file_thr=$($Global:AggregationFileThreshold) proc_thr=$($Global:AggregationProcessThreshold) net_thr=$($Global:AggregationNetworkThreshold)" "INFO"
    } catch {
        Write-Log "[AGGREGATION] Config update error: $($_.Exception.Message)" "WARN"
    }
}
