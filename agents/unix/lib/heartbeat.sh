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

            # Skip firewall remediation flag
            local skip_fw
            skip_fw=$(echo "$result" | jq -r '.skip_firewall_remediation // false' 2>/dev/null)
            [[ "$skip_fw" == "true" ]] && SKIP_FIREWALL_REMEDIATION=true || SKIP_FIREWALL_REMEDIATION=false

            # Fase 3 Blindagem: validate expected_sha256 + signature_timestamp
            _validate_heartbeat_integrity "$result"

            # TOCTOU Self-Heal: process force_hash_resync from server
            _process_hash_resync "$result"
        fi
        return 0
    else
        log "ERROR" "[HEARTBEAT] Failed"
        return 1
    fi
}

# Fase 3 Blindagem: Validate integrity fields from heartbeat response.
# If server sends expected_sha256, verify it matches our local script hash.
# If signature_timestamp is present, verify it's not stale (max 48h).
_validate_heartbeat_integrity() {
    local response="$1"

    local expected_sha256 sig_timestamp script_sig
    expected_sha256=$(echo "$response" | jq -r '.expected_sha256 // empty' 2>/dev/null)
    sig_timestamp=$(echo "$response" | jq -r '.signature_timestamp // empty' 2>/dev/null)
    script_sig=$(echo "$response" | jq -r '.script_hash_signature // empty' 2>/dev/null)

    # Skip validation if server didn't send integrity fields
    if [[ -z "$expected_sha256" || ${#expected_sha256} -ne 64 ]]; then
        return 0
    fi

    # Validate expected_sha256 against local hash cache
    local local_hash=""
    if [[ -f "$HASH_CACHE_JSON" ]]; then
        local_hash=$(jq -r '.hash // empty' "$HASH_CACHE_JSON" 2>/dev/null)
    fi

    if [[ -n "$local_hash" && "$local_hash" != "$expected_sha256" ]]; then
        log "WARN" "[INTEGRITY] Hash mismatch: local=${local_hash:0:12}... expected=${expected_sha256:0:12}..."
        # Don't block — just flag for resync via next heartbeat
    fi

    # Validate signature_timestamp freshness (max 48h)
    if [[ -n "$sig_timestamp" ]]; then
        local sig_epoch now_epoch age_hours
        sig_epoch=$(date -d "$sig_timestamp" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${sig_timestamp%%.*}" +%s 2>/dev/null || echo 0)
        now_epoch=$(date +%s)
        if [[ "$sig_epoch" -gt 0 ]]; then
            age_hours=$(( (now_epoch - sig_epoch) / 3600 ))
            if [[ $age_hours -gt 48 ]]; then
                log "WARN" "[INTEGRITY] Signature timestamp is stale (${age_hours}h old)"
            fi
        fi
    fi

    # Log signature presence for audit trail
    if [[ -n "$script_sig" ]]; then
        log "DEBUG" "[INTEGRITY] Heartbeat includes valid script signature"
    else
        log "DEBUG" "[INTEGRITY] Heartbeat has no script signature (unsigned or re-signing unavailable)"
    fi

    return 0
}

# Process the force_hash_resync signal from heartbeat response.
# When the server sends a valid script_sha256 with force_hash_resync=true,
# update the local hash cache to prevent false TOCTOU violations.
_process_hash_resync() {
    local response="$1"

    local force_resync server_hash server_sig
    force_resync=$(echo "$response" | jq -r '.force_hash_resync // false' 2>/dev/null)
    server_hash=$(echo "$response" | jq -r '.script_sha256 // empty' 2>/dev/null)
    server_sig=$(echo "$response" | jq -r '.script_hash_signature // empty' 2>/dev/null)

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

    # Update the local hash cache with the server-authoritative hash + signature
    log "INFO" "[HEARTBEAT] Force hash resync: updating cache from server (${server_hash:0:12}...)"
    save_signed_hash_cache "$server_hash" "${server_sig:-}"

    # Reset TOCTOU failure counter since we just resynced
    TOCTOU_CONSECUTIVE_FAILURES=0

    # If agent was in SAFE_MODE due to integrity, recover to ENFORCING
    if [[ "$CURRENT_STATE" == "SAFE_MODE" ]]; then
        log "SUCCESS" "[HEARTBEAT] Recovering from SAFE_MODE after hash resync"
        set_agent_state "ENFORCING" "Hash resync recovery"
    fi

    return 0
}
