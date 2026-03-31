#!/usr/bin/env bash
#
# CyberShield Agent - Main Loop Orchestrator
#

run_main_loop() {
    log "INFO" "[START] CyberShield Agent $AGENT_VERSION"

    # Phase 1: Init
    set_agent_state "INITIALIZING" "Agent startup"
    local keys_initialized=false security_degraded=false
    if initialize_agent_keys; then keys_initialized=true; else
        set_agent_state "DEGRADED" "Key init failed"; security_degraded=true
    fi

    validate_hash_cache_schema || true
    local initial_hash
    initial_hash=$(sha256sum "$0" 2>/dev/null | cut -d' ' -f1)
    [[ -n "$initial_hash" && ${#initial_hash} -eq 64 ]] && save_signed_hash_cache "$initial_hash" ""

    # Phase 2: Auth
    [[ "$security_degraded" != "true" ]] && set_agent_state "AUTHENTICATING" "Validating credentials"
    if send_heartbeat; then
        CONSECUTIVE_HEARTBEAT_FAILURES=0
        [[ "$keys_initialized" == "true" ]] && register_agent_key || true
    else
        set_agent_state "DEGRADED" "Heartbeat failed"
        CONSECUTIVE_HEARTBEAT_FAILURES=$((CONSECUTIVE_HEARTBEAT_FAILURES + 1))
        [[ "$keys_initialized" == "false" ]] && set_agent_state "SAFE_MODE" "No auth + no crypto"
    fi

    # Phase 3: Sync
    set_agent_state "SYNCING" "Syncing policies"
    initialize_process_baseline

    # Phase 4: Enforce
    set_agent_state "ENFORCING" "Normal operation"
    log "SUCCESS" "[STARTUP] Agent fully operational"

    local last_heartbeat last_auto_repair last_job_poll
    last_heartbeat=$(date +%s)
    last_auto_repair=$(date +%s)
    last_job_poll=$(date +%s)
    LAST_RUNTIME_INTEGRITY_CHECK=$(date +%s)
    CONSECUTIVE_HEARTBEAT_FAILURES=0

    while true; do
        local now
        now=$(date +%s)
        CACHED_EPOCH=$now
        CACHED_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

        # Network watchdog
        local network_ok=false
        if test_network_connectivity; then
            network_ok=true
            [[ $CONSECUTIVE_NETWORK_FAILURES -ge 3 && "$CURRENT_STATE" == "DEGRADED" ]] && set_agent_state "ENFORCING" "Network restored"
            CONSECUTIVE_NETWORK_FAILURES=0
        else
            CONSECUTIVE_NETWORK_FAILURES=$((CONSECUTIVE_NETWORK_FAILURES + 1))
            [[ $CONSECUTIVE_NETWORK_FAILURES -ge 3 ]] && set_agent_state "DEGRADED" "Network lost"
        fi

        # Job polling
        if [[ $((now - last_job_poll)) -ge $JOB_POLL_INTERVAL && "$network_ok" == "true" ]]; then
            local jobs
            jobs=$(poll_jobs)
            echo "$jobs" | jq -c '.[]' 2>/dev/null | while read -r job; do
                [[ -n "$job" ]] && submit_job_result "$job" "$(execute_job "$job")"
            done
            last_job_poll=$now
        fi

        # Service health (platform-specific)
        _check_service_health

        # Auto-repair every 5 min
        if [[ $((now - last_auto_repair)) -ge 300 ]]; then
            _auto_repair
            last_auto_repair=$now
        fi

        # Heartbeat
        if [[ $((now - last_heartbeat)) -ge $POLL_INTERVAL && "$network_ok" == "true" ]]; then
            if send_heartbeat; then
                CONSECUTIVE_HEARTBEAT_FAILURES=0
                [[ "$CURRENT_STATE" == "DEGRADED" ]] && set_agent_state "ENFORCING" "Heartbeat restored"
            else
                CONSECUTIVE_HEARTBEAT_FAILURES=$((CONSECUTIVE_HEARTBEAT_FAILURES + 1))
                [[ "$CURRENT_STATE" == "ENFORCING" ]] && set_agent_state "DEGRADED" "Heartbeat failed"
            fi
            last_heartbeat=$now
        fi

        # Runtime integrity
        if [[ $((now - LAST_RUNTIME_INTEGRITY_CHECK)) -ge $RUNTIME_INTEGRITY_INTERVAL ]]; then
            if ! test_runtime_integrity; then
                set_agent_state "SAFE_MODE" "Integrity violation"
                break
            fi
            LAST_RUNTIME_INTEGRITY_CHECK=$now
        fi

        # Adaptive sleep
        local sleep_time=2
        local current_cpu
        current_cpu=$(_get_cpu_percent)
        [[ ${current_cpu:-0} -gt 80 ]] && sleep_time=$ADAPTIVE_MIN_SLEEP

        flush_log_buffer
        sleep "$sleep_time"
    done
}
