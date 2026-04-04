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

            # TOCTOU Self-Heal: process force_hash_resync from server
            _process_hash_resync "$result"
        fi
        return 0
    else
        log "ERROR" "[HEARTBEAT] Failed"
        return 1
    fi
}

# Process the force_hash_resync signal from heartbeat response.
# When the server sends a valid script_sha256 with force_hash_resync=true,
# update the local hash cache to prevent false TOCTOU violations.
_process_hash_resync() {
    local response="$1"

    local force_resync server_hash
    force_resync=$(echo "$response" | jq -r '.force_hash_resync // false' 2>/dev/null)
    server_hash=$(echo "$response" | jq -r '.script_sha256 // empty' 2>/dev/null)

    # Only resync when explicitly requested AND server provides a valid 64-char hex hash
    if [[ "$force_resync" != "true" || -z "$server_hash" || ${#server_hash} -ne 64 ]]; then
        return 0
    fi

    # Compare with current cache — skip write if already in sync
    local cached_hash=""
    if [[ -f "$HASH_CACHE_JSON" ]]; then
        cached_hash=$(jq -r '.hash // empty' "$HASH_CACHE_JSON" 2>/dev/null)
    fi

    if [[ "$cached_hash" == "$server_hash" ]]; then
        log "DEBUG" "[HEARTBEAT] Hash cache already in sync with server"
        return 0
    fi

    # Update the local hash cache with the server-authoritative hash
    log "INFO" "[HEARTBEAT] Force hash resync: updating cache from server (${server_hash:0:12}...)"
    save_signed_hash_cache "$server_hash" ""

    # Reset TOCTOU failure counter since we just resynced
    TOCTOU_CONSECUTIVE_FAILURES=0

    # If agent was in SAFE_MODE due to integrity, recover to ENFORCING
    if [[ "$CURRENT_STATE" == "SAFE_MODE" ]]; then
        log "SUCCESS" "[HEARTBEAT] Recovering from SAFE_MODE after hash resync"
        set_agent_state "ENFORCING" "Hash resync recovery"
    fi

    return 0
}
