#!/usr/bin/env bash
#
# CyberShield Agent - Heartbeat
#

send_heartbeat() {
    log "DEBUG" "[HEARTBEAT] Sending..."
    local metrics top_processes anomalies anomaly_count
    metrics=$(_get_system_metrics)
    top_processes=$(_get_top_processes)
    anomalies=$(get_process_anomalies)
    anomaly_count=$(echo "$anomalies" | jq -r '.anomaly_count' 2>/dev/null || echo 0)

    local payload='{"agent_name":"'"$AGENT_NAME"'","agent_version":"'"$AGENT_VERSION"'","hostname":"'"$(hostname)"'","timestamp":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'","system_metrics":'"$metrics"',"processes":'"$top_processes"',"process_anomaly_count":'"$anomaly_count"',"state":"'"$CURRENT_STATE"'"}'

    local result
    result=$(invoke_secure_request "POST" "/functions/v1/heartbeat" "$payload" 30 3)
    local exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        log "SUCCESS" "[HEARTBEAT] Sent successfully"
        if [[ -n "$result" ]]; then
            local force_update
            force_update=$(echo "$result" | jq -r '.force_update // false' 2>/dev/null)
            [[ "$force_update" == "true" ]] && _apply_forced_update "$result"

            local new_hb new_job
            new_hb=$(echo "$result" | jq -r '.heartbeat_interval_seconds // 0' 2>/dev/null)
            [[ "$new_hb" -ge 10 && "$new_hb" != "$POLL_INTERVAL" ]] && POLL_INTERVAL=$new_hb
            new_job=$(echo "$result" | jq -r '.poll_interval_seconds // 0' 2>/dev/null)
            [[ "$new_job" -ge 10 && "$new_job" != "$JOB_POLL_INTERVAL" ]] && JOB_POLL_INTERVAL=$new_job
        fi
        return 0
    else
        log "ERROR" "[HEARTBEAT] Failed"
        return 1
    fi
}
