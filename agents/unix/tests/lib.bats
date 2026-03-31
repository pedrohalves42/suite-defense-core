#!/usr/bin/env bats
#
# Tests for shared lib.sh - FSM, logging, integrity, hash chain
#

SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"

setup() {
    source "$SCRIPT_DIR/test_helper.sh"
    setup_test_env
    source "$SCRIPT_DIR/../lib.sh" 2>/dev/null || true
    # Re-declare associative arrays (lost in BATS subshell)
    declare -gA STATE_TRANSITIONS=(
        ["INITIALIZING"]="AUTHENTICATING SAFE_MODE"
        ["AUTHENTICATING"]="SYNCING DEGRADED SAFE_MODE"
        ["SYNCING"]="ENFORCING DEGRADED SAFE_MODE"
        ["ENFORCING"]="SYNCING DEGRADED SAFE_MODE"
        ["DEGRADED"]="AUTHENTICATING SYNCING ENFORCING SAFE_MODE"
        ["SAFE_MODE"]="INITIALIZING"
    )
}

teardown() {
    teardown_test_env
}

# ============================================
#  FSM TESTS
# ============================================

@test "FSM: initial state is INITIALIZING" {
    [ "$CURRENT_STATE" = "INITIALIZING" ]
}

@test "FSM: valid transition INITIALIZING -> AUTHENTICATING" {
    CURRENT_STATE="INITIALIZING"
    set_agent_state "AUTHENTICATING" "test"
    [ "$CURRENT_STATE" = "AUTHENTICATING" ]
}

@test "FSM: invalid transition INITIALIZING -> ENFORCING" {
    CURRENT_STATE="INITIALIZING"
    # Should fail - not a valid transition
    ! set_agent_state "ENFORCING" "test" 2>/dev/null
    [ "$CURRENT_STATE" = "INITIALIZING" ]
}

@test "FSM: same-state transition is no-op" {
    CURRENT_STATE="ENFORCING"
    run set_agent_state "ENFORCING" "test"
    [ "$status" -eq 0 ]
}

@test "FSM: DEGRADED can go to ENFORCING" {
    CURRENT_STATE="DEGRADED"
    set_agent_state "ENFORCING" "recovered"
    [ "$CURRENT_STATE" = "ENFORCING" ]
}

@test "FSM: SAFE_MODE can only go to INITIALIZING" {
    CURRENT_STATE="SAFE_MODE"
    set_agent_state "INITIALIZING" "restart"
    [ "$CURRENT_STATE" = "INITIALIZING" ]
}

@test "FSM: SAFE_MODE cannot go to ENFORCING" {
    CURRENT_STATE="SAFE_MODE"
    ! set_agent_state "ENFORCING" "test" 2>/dev/null
    [ "$CURRENT_STATE" = "SAFE_MODE" ]
}

@test "FSM: state persisted to file" {
    CURRENT_STATE="INITIALIZING"
    set_agent_state "AUTHENTICATING" "test-persist"
    [ -f "$STATE_PATH" ]
    local saved
    saved=$(jq -r '.state' "$STATE_PATH")
    [ "$saved" = "AUTHENTICATING" ]
}

# ============================================
#  LOGGING TESTS
# ============================================

@test "log: writes to log buffer" {
    LOG_BUFFER=""
    LOG_BUFFER_COUNT=0
    log "INFO" "test message"
    [ -n "$LOG_BUFFER" ]
    [[ "$LOG_BUFFER" == *"test message"* ]]
}

@test "log: includes state in output" {
    CURRENT_STATE="ENFORCING"
    LOG_BUFFER=""
    log "INFO" "state test"
    [[ "$LOG_BUFFER" == *"ENFORCING"* ]]
}

@test "flush_log_buffer: writes buffer to file" {
    LOG_BUFFER="test line\n"
    LOG_BUFFER_COUNT=1
    flush_log_buffer
    [ -f "$LOG_FILE" ]
    [ "$LOG_BUFFER_COUNT" -eq 0 ]
}

# ============================================
#  HASH CHAIN TESTS
# ============================================

@test "get_execution_hash: returns valid JSON" {
    local result
    result=$(get_execution_hash "exec-1" "job-1" "genesis")
    echo "$result" | jq -e '.execution_hash' > /dev/null
    echo "$result" | jq -e '.execution_index' > /dev/null
}

@test "get_execution_hash: increments index" {
    EXECUTION_CHAIN_INDEX=0
    get_execution_hash "e1" "j1" "genesis" > /dev/null
    [ "$EXECUTION_CHAIN_INDEX" -eq 1 ]
    get_execution_hash "e2" "j2" "prev" > /dev/null
    [ "$EXECUTION_CHAIN_INDEX" -eq 2 ]
}

@test "get_execution_hash: different inputs produce different hashes" {
    EXECUTION_CHAIN_INDEX=0
    local h1 h2
    h1=$(get_execution_hash "e1" "j1" "genesis" | jq -r '.execution_hash')
    h2=$(get_execution_hash "e2" "j2" "genesis" | jq -r '.execution_hash')
    [ "$h1" != "$h2" ]
}

# ============================================
#  INTEGRITY TESTS
# ============================================

@test "save_signed_hash_cache: creates JSON cache" {
    save_signed_hash_cache "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234" "sig"
    [ -f "$HASH_CACHE_JSON" ]
    local hash
    hash=$(jq -r '.hash' "$HASH_CACHE_JSON")
    [ "$hash" = "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234" ]
}

@test "save_signed_hash_cache: creates TXT cache" {
    save_signed_hash_cache "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" ""
    [ -f "$HASH_CACHE_TXT" ]
}

@test "validate_hash_cache_schema: accepts valid cache" {
    cat > "$HASH_CACHE_JSON" <<'EOF'
{"hash":"abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234","signature":"","signed_at":"2024-01-01T00:00:00Z","algorithm":"Ed25519","verified":true}
EOF
    run validate_hash_cache_schema
    [ "$status" -eq 0 ]
}

@test "validate_hash_cache_schema: rejects cache with extra keys" {
    cat > "$HASH_CACHE_JSON" <<'EOF'
{"hash":"abcd","signature":"","evil_payload":"malicious","signed_at":"2024-01-01T00:00:00Z","algorithm":"Ed25519","verified":true}
EOF
    run validate_hash_cache_schema
    [ "$status" -ne 0 ]
    [ ! -f "$HASH_CACHE_JSON" ]
}

@test "validate_hash_cache_schema: returns 0 when no cache exists" {
    rm -f "$HASH_CACHE_JSON"
    run validate_hash_cache_schema
    [ "$status" -eq 0 ]
}

@test "get_saved_state: returns INITIALIZING when no state file" {
    rm -f "$STATE_PATH"
    local state
    state=$(get_saved_state)
    [ "$state" = "INITIALIZING" ]
}

@test "get_saved_state: reads from state file" {
    echo '{"state":"ENFORCING"}' > "$STATE_PATH"
    local state
    state=$(get_saved_state)
    [ "$state" = "ENFORCING" ]
}

# ============================================
#  NETWORK WATCHDOG TESTS
# ============================================

@test "test_network_connectivity: function exists" {
    declare -f test_network_connectivity > /dev/null
}

@test "CONSECUTIVE_NETWORK_FAILURES: starts at zero" {
    [ "$CONSECUTIVE_NETWORK_FAILURES" -eq 0 ]
}

@test "MAX_CONSECUTIVE_FAILURES: has sane default" {
    [ "$MAX_CONSECUTIVE_FAILURES" -gt 0 ]
}

# ============================================
#  PROCESS BASELINE TESTS
# ============================================

@test "initialize_process_baseline: creates baseline file" {
    # Mock _list_process_names
    _list_process_names() { echo -e "bash\nssh\ncron"; }
    export -f _list_process_names
    rm -f "$PROCESS_BASELINE_PATH"
    initialize_process_baseline
    [ -f "$PROCESS_BASELINE_PATH" ]
}

@test "initialize_process_baseline: baseline has valid JSON" {
    _list_process_names() { echo -e "bash\nssh"; }
    export -f _list_process_names
    rm -f "$PROCESS_BASELINE_PATH"
    initialize_process_baseline
    jq -e '.[0].name' "$PROCESS_BASELINE_PATH" > /dev/null
}

@test "get_process_anomalies: returns JSON with anomaly_count" {
    _list_process_names() { echo "bash"; }
    export -f _list_process_names
    PROCESS_BASELINE=("bash")
    PROCESS_BASELINE_MAP=([bash]=1)
    local result
    result=$(get_process_anomalies)
    echo "$result" | jq -e '.anomaly_count' > /dev/null
}

@test "get_process_anomalies: detects new process" {
    _list_process_names() { echo -e "bash\nnew_process"; }
    export -f _list_process_names
    PROCESS_BASELINE=("bash")
    declare -gA PROCESS_BASELINE_MAP=([bash]=1)
    local result
    result=$(get_process_anomalies)
    local count
    count=$(echo "$result" | jq -r '.anomaly_count')
    [ "$count" -ge 1 ]
}

# ============================================
#  JOB EXECUTION TESTS
# ============================================

@test "execute_job: returns valid JSON result" {
    _dispatch_job() { echo '{"result":"ok"}'; }
    export -f _dispatch_job
    EXECUTION_CHAIN_INDEX=0
    EXECUTION_CHAIN_LAST_HASH="genesis"
    local job='{"id":"j1","execution_id":"e1","job_type":"test"}'
    local result
    result=$(execute_job "$job")
    echo "$result" | jq -e '.status' > /dev/null
    echo "$result" | jq -e '.execution_hash' > /dev/null
}

@test "execute_job: includes output_hash" {
    _dispatch_job() { echo '{"pong":true}'; }
    export -f _dispatch_job
    EXECUTION_CHAIN_INDEX=0
    EXECUTION_CHAIN_LAST_HASH="genesis"
    local job='{"id":"j2","execution_id":"e2","job_type":"ping"}'
    local result
    result=$(execute_job "$job")
    local hash
    hash=$(echo "$result" | jq -r '.output_hash')
    [ ${#hash} -eq 64 ]
}

# ============================================
#  COMMON JOB HANDLER TESTS
# ============================================

@test "integration_test_handler: returns pong" {
    local result
    result=$(integration_test_handler)
    local pong
    pong=$(echo "$result" | jq -r '.pong')
    [ "$pong" = "true" ]
}

@test "integration_test_handler: includes agent version" {
    local result
    result=$(integration_test_handler)
    local version
    version=$(echo "$result" | jq -r '.agent_version')
    [ "$version" = "$AGENT_VERSION" ]
}

@test "update_agent_handler: returns success" {
    local result
    result=$(update_agent_handler)
    local success
    success=$(echo "$result" | jq -r '.success')
    [ "$success" = "true" ]
}

# ============================================
#  ADAPTIVE SLEEP & CONSTANTS TESTS
# ============================================

@test "AGENT_VERSION: is set" {
    [ -n "$AGENT_VERSION" ]
}

@test "POLL_INTERVAL: has sane default" {
    [ "$POLL_INTERVAL" -ge 10 ]
}

@test "JOB_POLL_INTERVAL: has sane default" {
    [ "$JOB_POLL_INTERVAL" -ge 10 ]
}

@test "ADAPTIVE_MIN_SLEEP: is positive" {
    [ "$ADAPTIVE_MIN_SLEEP" -gt 0 ]
}

@test "RUNTIME_INTEGRITY_INTERVAL: is positive" {
    [ "$RUNTIME_INTEGRITY_INTERVAL" -gt 0 ]
}
