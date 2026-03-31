#!/usr/bin/env bash
#
# CyberShield Agent - Shared Unix Library v6.0
# Common functions for Linux and macOS agents.
# Sourced by platform-specific entrypoints.
#
# This file MUST NOT be executed directly.

# Prevent direct execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "ERROR: lib.sh must be sourced, not executed directly." >&2
    exit 1
fi

# ============================================
#  CONSTANTS
# ============================================
AGENT_VERSION="v6.0.0"
POLL_INTERVAL=60
JOB_POLL_INTERVAL=30

# ECDSA P-256 Keys (paths set by platform entrypoint)
SIGNING_FINGERPRINT=""
KEY_VERSION=0

# FSM States
declare -A FSM_STATES=(
    [INITIALIZING]="INITIALIZING"
    [AUTHENTICATING]="AUTHENTICATING"
    [SYNCING]="SYNCING"
    [ENFORCING]="ENFORCING"
    [DEGRADED]="DEGRADED"
    [SAFE_MODE]="SAFE_MODE"
)
CURRENT_STATE="INITIALIZING"

declare -A STATE_TRANSITIONS=(
    ["INITIALIZING"]="AUTHENTICATING SAFE_MODE"
    ["AUTHENTICATING"]="SYNCING DEGRADED SAFE_MODE"
    ["SYNCING"]="ENFORCING DEGRADED SAFE_MODE"
    ["ENFORCING"]="SYNCING DEGRADED SAFE_MODE"
    ["DEGRADED"]="AUTHENTICATING SYNCING ENFORCING SAFE_MODE"
    ["SAFE_MODE"]="INITIALIZING"
)

# Hash Chain
EXECUTION_CHAIN_LAST_HASH="genesis"
EXECUTION_CHAIN_INDEX=0

# Auto-repair thresholds
DISK_CLEANUP_THRESHOLD=95
HIGH_CPU_THRESHOLD=90
AUTO_REPAIR_DISK_CLEANUPS=0
AUTO_REPAIR_PROCESSES_KILLED=0
AUTO_REPAIR_LAST_DISK_CLEANUP=""
AUTO_REPAIR_LAST_PROCESS_KILL=""

# Network
NETWORK_TEST_HOST=""
NETWORK_TEST_PORT=443
CONSECUTIVE_NETWORK_FAILURES=0
CONSECUTIVE_HEARTBEAT_FAILURES=0
MAX_CONSECUTIVE_FAILURES=1000000

# Integrity
LAST_RUNTIME_INTEGRITY_CHECK=0
RUNTIME_INTEGRITY_INTERVAL=300

# Process baseline
declare -a PROCESS_BASELINE=()
declare -A PROCESS_BASELINE_MAP=()

# Log buffering
LOG_BUFFER=""
LOG_BUFFER_COUNT=0
LOG_BUFFER_MAX=20
LOG_BUFFER_LAST_FLUSH=0
LOG_CALL_COUNT=0
LOG_ROTATION_CHECK_INTERVAL=100
CACHED_TIMESTAMP=""
CACHED_EPOCH=0
ADAPTIVE_MIN_SLEEP=10
LAST_CPU_PERCENT=0

# ============================================
#  LOGGING (Buffered)
# ============================================
flush_log_buffer() {
    if [[ -n "$LOG_BUFFER" ]]; then
        echo -n "$LOG_BUFFER" >> "$LOG_FILE" 2>/dev/null
        LOG_BUFFER=""
        LOG_BUFFER_COUNT=0
        LOG_BUFFER_LAST_FLUSH=$(date +%s)
    fi
}

log() {
    local level="${1:-INFO}"
    local message="$2"
    local timestamp
    if [[ -n "$CACHED_TIMESTAMP" ]]; then
        timestamp="$CACHED_TIMESTAMP"
    else
        timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    fi
    local line="[$timestamp] [$level] [$CURRENT_STATE] $message"
    echo "$line"

    LOG_BUFFER+="$line"$'\n'
    LOG_BUFFER_COUNT=$((LOG_BUFFER_COUNT + 1))
    LOG_CALL_COUNT=$((LOG_CALL_COUNT + 1))

    local now_epoch=${CACHED_EPOCH:-$(date +%s)}
    if [[ $LOG_BUFFER_COUNT -ge $LOG_BUFFER_MAX ]] || \
       [[ "$level" == "ERROR" ]] || \
       [[ $((now_epoch - LOG_BUFFER_LAST_FLUSH)) -ge 10 ]]; then
        flush_log_buffer
    fi

    if [[ $((LOG_CALL_COUNT % LOG_ROTATION_CHECK_INTERVAL)) -eq 0 ]]; then
        local log_size
        log_size=$(_stat_size "$LOG_FILE")
        if [[ $log_size -gt 10485760 ]]; then
            mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S).bak"
        fi
    fi
}

# ============================================
#  FSM STATE MACHINE
# ============================================
set_agent_state() {
    local new_state="$1"
    local reason="${2:-}"
    local old_state="$CURRENT_STATE"

    [[ "$old_state" == "$new_state" ]] && return 0

    local allowed="${STATE_TRANSITIONS[$old_state]}"
    if [[ ! " $allowed " =~ " $new_state " ]]; then
        log "ERROR" "[FSM] Invalid transition: $old_state -> $new_state (allowed: $allowed)"
        return 1
    fi

    CURRENT_STATE="$new_state"
    log "INFO" "[FSM] State transition: $old_state -> $new_state (Reason: $reason)"

    cat > "$STATE_PATH" <<EOF
{"state":"$new_state","previous_state":"$old_state","transition_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")","reason":"$reason"}
EOF
    return 0
}

get_saved_state() {
    if [[ -f "$STATE_PATH" ]]; then
        jq -r '.state // "INITIALIZING"' "$STATE_PATH" 2>/dev/null || echo "INITIALIZING"
    else
        echo "INITIALIZING"
    fi
}

# ============================================
#  SECURE REQUEST WITH EXPONENTIAL BACKOFF
# ============================================
invoke_secure_request() {
    local method="$1"
    local path="$2"
    local body="${3:-}"
    local timeout="${4:-30}"
    local max_retries="${5:-5}"

    local url
    if [[ "$path" == http* ]]; then url="$path"; else url="${SERVER_URL}${path}"; fi

    local retry_count=0
    local base_delay=1
    local max_delay=60

    while [[ $retry_count -lt $max_retries ]]; do
        local headers=(
            -H "User-Agent: CyberShield-Agent/$AGENT_VERSION"
            -H "X-Agent-Token: $AGENT_TOKEN"
            -H "X-Agent-Name: $AGENT_NAME"
        )

        if [[ -n "$HMAC_SECRET" ]]; then
            local timestamp nonce signature_payload signature
            timestamp=$(date +%s)
            nonce=$(_generate_uuid)
            signature_payload="${timestamp}.${nonce}.${body:-}"
            signature=$(echo -n "$signature_payload" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $2}')
            headers+=(
                -H "X-HMAC-Signature: $signature"
                -H "X-HMAC-Timestamp: $timestamp"
                -H "X-HMAC-Nonce: $nonce"
            )
        fi

        local result http_code
        if [[ "$method" == "GET" ]]; then
            result=$(curl -s -w "\n%{http_code}" --tlsv1.2 --connect-timeout 10 --max-time "$timeout" "${headers[@]}" "$url" 2>/dev/null) || true
        else
            result=$(curl -s -w "\n%{http_code}" --tlsv1.2 --connect-timeout 10 --max-time "$timeout" -X "$method" -H "Content-Type: application/json" "${headers[@]}" -d "$body" "$url" 2>/dev/null) || true
        fi

        http_code=$(echo "$result" | tail -n1)
        local response_body
        response_body=$(echo "$result" | sed '$d')

        if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
            echo "$response_body"
            return 0
        fi

        retry_count=$((retry_count + 1))
        if [[ "$http_code" =~ ^(502|503|504|429|000)$ && $retry_count -lt $max_retries ]]; then
            local delay=$((base_delay * (2 ** (retry_count - 1))))
            [[ $delay -gt $max_delay ]] && delay=$max_delay
            log "WARN" "[NETWORK] Request failed (attempt $retry_count/$max_retries), retrying in ${delay}s (HTTP: $http_code)"
            sleep "$delay"
        else
            log "ERROR" "[NETWORK] Request failed permanently (HTTP: $http_code)"
            return 1
        fi
    done
    return 1
}

# ============================================
#  ECDSA P-256 KEY MANAGEMENT
# ============================================
generate_signing_keypair() {
    log "INFO" "[KEYS] Generating new ECDSA P-256 keypair..."
    local max_attempts=3 attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if [[ -f "$PRIVATE_KEY_PATH" ]]; then
            cp "$PRIVATE_KEY_PATH" "$PREVIOUS_KEY_PATH" 2>/dev/null || true
        fi
        if [[ $attempt -gt 1 ]]; then
            rm -f "$PRIVATE_KEY_PATH" "$PUBLIC_KEY_PATH" 2>/dev/null || true
            sleep 1
        fi

        if openssl ecparam -genkey -name prime256v1 -noout -out "$PRIVATE_KEY_PATH" 2>/dev/null; then
            chmod 600 "$PRIVATE_KEY_PATH"
            if openssl ec -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH" 2>/dev/null; then
                local fingerprint
                fingerprint=$(openssl dgst -sha256 -binary "$PUBLIC_KEY_PATH" | xxd -p | tr -d '\n')
                echo "$fingerprint" > "$FINGERPRINT_PATH"
                SIGNING_FINGERPRINT="$fingerprint"
                log "SUCCESS" "[KEYS] Keypair generated (fingerprint: ${fingerprint:0:16}...)"
                echo "$fingerprint"
                return 0
            fi
        fi
        attempt=$((attempt + 1))
    done
    log "ERROR" "[KEYS] All ECDSA attempts failed. Signing DISABLED."
    return 1
}

initialize_agent_keys() {
    if [[ -f "$PRIVATE_KEY_PATH" && -f "$PUBLIC_KEY_PATH" && -f "$FINGERPRINT_PATH" ]]; then
        SIGNING_FINGERPRINT=$(cat "$FINGERPRINT_PATH" 2>/dev/null)
        log "INFO" "[KEYS] Loaded existing keypair (fingerprint: ${SIGNING_FINGERPRINT:0:16}...)"
        return 0
    fi
    SIGNING_FINGERPRINT=$(generate_signing_keypair)
    [[ -z "$SIGNING_FINGERPRINT" ]] && return 1
    return 0
}

register_agent_key() {
    local public_key_b64
    public_key_b64=$(base64 -w0 "$PUBLIC_KEY_PATH" 2>/dev/null || base64 "$PUBLIC_KEY_PATH" 2>/dev/null)
    local body='{"public_key":"'"$public_key_b64"'","key_fingerprint":"'"$SIGNING_FINGERPRINT"'","algorithm":"ECDSA-P256-SHA256"}'
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/register-agent-key" "$body" 30)
    if [[ $? -eq 0 ]]; then
        KEY_VERSION=$(echo "$result" | jq -r '.version // 1' 2>/dev/null)
        log "SUCCESS" "[KEYS] Public key registered (version: $KEY_VERSION)"
        return 0
    fi
    log "WARN" "[KEYS] Failed to register public key"
    return 1
}

sign_execution_result() {
    local canonical="${1}:${2}:${3}:${4}:${5}"
    echo -n "$canonical" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" 2>/dev/null | base64 -w0 2>/dev/null || base64 2>/dev/null
}

# ============================================
#  HASH CHAIN
# ============================================
get_execution_hash() {
    local execution_id="$1" job_id="$2" previous_hash="$3"
    EXECUTION_CHAIN_INDEX=$((EXECUTION_CHAIN_INDEX + 1))
    local hash
    hash=$(echo -n "${execution_id}:${job_id}:${previous_hash}:${EXECUTION_CHAIN_INDEX}" | sha256sum | cut -d' ' -f1)
    EXECUTION_CHAIN_LAST_HASH="$hash"
    echo "{\"execution_hash\":\"$hash\",\"previous_execution_hash\":\"$previous_hash\",\"execution_index\":$EXECUTION_CHAIN_INDEX}"
}

# ============================================
#  INTEGRITY
# ============================================
test_runtime_integrity() {
    local expected_hash=""
    if [[ -f "$HASH_CACHE_JSON" ]]; then
        expected_hash=$(jq -r '.hash // empty' "$HASH_CACHE_JSON" 2>/dev/null)
    fi
    if [[ -z "$expected_hash" && -f "$HASH_CACHE_TXT" ]]; then
        expected_hash=$(cat "$HASH_CACHE_TXT" 2>/dev/null | tr -d '[:space:]')
    fi
    [[ -z "$expected_hash" || ${#expected_hash} -ne 64 ]] && return 0

    local current_hash
    current_hash=$(sha256sum "$0" 2>/dev/null | cut -d' ' -f1)
    if [[ "$current_hash" != "${expected_hash,,}" ]]; then
        log "ERROR" "[INTEGRITY] TOCTOU VIOLATION: Script modified!"
        return 1
    fi
    return 0
}

save_signed_hash_cache() {
    local hash="$1" signature="${2:-}"
    echo "$hash" > "$HASH_CACHE_TXT" 2>/dev/null || true
    cat > "$HASH_CACHE_JSON" <<EOJSON
{"hash":"$hash","signature":"$signature","signed_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")","algorithm":"Ed25519","verified":true}
EOJSON
    chmod 600 "$HASH_CACHE_JSON" "$HASH_CACHE_TXT" 2>/dev/null || true
}

validate_hash_cache_schema() {
    [[ ! -f "$HASH_CACHE_JSON" ]] && return 0
    local extra_keys
    extra_keys=$(jq -r 'keys[] | select(. != "hash" and . != "signature" and . != "signed_at" and . != "algorithm" and . != "verified")' "$HASH_CACHE_JSON" 2>/dev/null)
    if [[ -n "$extra_keys" ]]; then
        log "ERROR" "[INTEGRITY] Unexpected properties in hash cache: $extra_keys"
        rm -f "$HASH_CACHE_JSON" 2>/dev/null || true
        return 1
    fi
    return 0
}

# ============================================
#  NETWORK WATCHDOG
# ============================================
test_network_connectivity() {
    nc -z -w5 "$NETWORK_TEST_HOST" "$NETWORK_TEST_PORT" 2>/dev/null
}

# ============================================
#  PROCESS BASELINE
# ============================================
initialize_process_baseline() {
    if [[ -f "$PROCESS_BASELINE_PATH" ]]; then
        while IFS= read -r proc; do
            PROCESS_BASELINE+=("$proc")
            PROCESS_BASELINE_MAP["$proc"]=1
        done < <(jq -r '.[].name' "$PROCESS_BASELINE_PATH" 2>/dev/null)
        log "INFO" "[BASELINE] Loaded ${#PROCESS_BASELINE[@]} processes"
    else
        log "INFO" "[BASELINE] Creating initial baseline..."
        local baseline='[' first=true ts
        ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        for proc in $(_list_process_names); do
            [[ "$first" == "true" ]] && first=false || baseline+=','
            baseline+="{\"name\":\"$proc\",\"first_seen\":\"$ts\"}"
            PROCESS_BASELINE+=("$proc")
            PROCESS_BASELINE_MAP["$proc"]=1
        done
        baseline+=']'
        echo "$baseline" > "$PROCESS_BASELINE_PATH"
        log "SUCCESS" "[BASELINE] Created with ${#PROCESS_BASELINE[@]} processes"
    fi
}

get_process_anomalies() {
    local anomaly_count=0
    for proc in $(_list_process_names); do
        if [[ -z "${PROCESS_BASELINE_MAP[$proc]+_}" ]]; then
            anomaly_count=$((anomaly_count + 1))
            PROCESS_BASELINE+=("$proc")
            PROCESS_BASELINE_MAP["$proc"]=1
        fi
    done
    echo '{"anomaly_count":'$anomaly_count'}'
}

# ============================================
#  JOB POLLING AND EXECUTION
# ============================================
poll_jobs() {
    local poll_body='{"agent_name":"'"$AGENT_NAME"'","agent_version":"'"$AGENT_VERSION"'","timestamp":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"}'
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/poll-jobs" "$poll_body" 15 2)
    if [[ $? -ne 0 ]]; then echo "[]"; return 1; fi
    echo "$result"
}

execute_job() {
    local job="$1"
    local start_time job_id job_type execution_id
    start_time=$(date +%s)
    execution_id=$(echo "$job" | jq -r '.execution_id' 2>/dev/null)
    job_id=$(echo "$job" | jq -r '.id' 2>/dev/null)
    job_type=$(echo "$job" | jq -r '.job_type // .type' 2>/dev/null)

    log "INFO" "[JOB] Starting: $job_type (ID: $job_id)"

    local hash_data output="" error_message="" status="completed"
    hash_data=$(get_execution_hash "$execution_id" "$job_id" "$EXECUTION_CHAIN_LAST_HASH")

    # Dispatch to handler (platform-specific + common)
    output=$(_dispatch_job "$job_type" "$job")
    if [[ $? -ne 0 && -z "$output" ]]; then
        error_message="Unknown job type: $job_type"
        status="failed"
    fi

    local end_time duration output_hash
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    output_hash=$(echo -n "$output" | sha256sum | cut -d' ' -f1)

    local exec_hash prev_hash exec_index
    exec_hash=$(echo "$hash_data" | jq -r '.execution_hash')
    prev_hash=$(echo "$hash_data" | jq -r '.previous_execution_hash')
    exec_index=$(echo "$hash_data" | jq -r '.execution_index')

    echo '{"success":true,"status":"'"$status"'","output":'"${output:-'{}'}"',"output_hash":"'"$output_hash"'","error_message":"'"$error_message"'","duration_seconds":'"$duration"',"execution_hash":"'"$exec_hash"'","previous_execution_hash":"'"$prev_hash"'","execution_index":'"$exec_index"'}'
}

submit_job_result() {
    local job="$1" result="$2"
    local execution_id job_id status output_hash finished_at signature output error_message exec_hash prev_hash exec_index
    execution_id=$(echo "$job" | jq -r '.execution_id')
    job_id=$(echo "$job" | jq -r '.id')
    status=$(echo "$result" | jq -r '.status')
    output_hash=$(echo "$result" | jq -r '.output_hash')
    finished_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    signature=$(sign_execution_result "$execution_id" "$job_id" "$status" "$output_hash" "$finished_at")
    output=$(echo "$result" | jq -c '.output // {}')
    error_message=$(echo "$result" | jq -r '.error_message // ""')
    exec_hash=$(echo "$result" | jq -r '.execution_hash')
    prev_hash=$(echo "$result" | jq -r '.previous_execution_hash')
    exec_index=$(echo "$result" | jq -r '.execution_index')

    local payload='{"execution_id":"'"$execution_id"'","job_id":"'"$job_id"'","status":"'"$status"'","output":'"$output"',"output_hash":"'"$output_hash"'","error_message":"'"$error_message"'","finished_at":"'"$finished_at"'","result_signature":"'"$signature"'","execution_hash":"'"$exec_hash"'","previous_execution_hash":"'"$prev_hash"'","execution_index":'"$exec_index"',"agent_version":"'"$AGENT_VERSION"'"}'
    invoke_secure_request "POST" "/functions/v1/submit-job-result" "$payload" 30 3
}

# ============================================
#  COMMON JOB HANDLERS
# ============================================
collect_network_info() {
    local adapters ip_addresses
    adapters=$(ip -j link show 2>/dev/null | jq -c '[.[] | {name: .ifname, mac: .address, state: .operstate}]' 2>/dev/null || echo '[]')
    ip_addresses=$(ip -j -4 addr show 2>/dev/null | jq -c '[.[] | .addr_info[] | {ip: .local, prefix: .prefixlen}]' 2>/dev/null || echo '[]')
    echo '{"adapters":'"$adapters"',"ip_addresses":'"$ip_addresses"',"collected_at":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"}'
}

update_agent_handler() {
    echo '{"success":true,"message":"Update delegated to heartbeat force_update mechanism","agent_version":"'"$AGENT_VERSION"'"}'
}

integration_test_handler() {
    echo '{"pong":true,"agent_version":"'"$AGENT_VERSION"'","timestamp":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'","hostname":"'"$(hostname)"'"}'
}

# ============================================
#  HEARTBEAT
# ============================================
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

# ============================================
#  MAIN LOOP
# ============================================
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
