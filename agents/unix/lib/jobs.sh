#!/usr/bin/env bash
#
# CyberShield Agent - Job Polling & Execution
#

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

# Common job handlers
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
