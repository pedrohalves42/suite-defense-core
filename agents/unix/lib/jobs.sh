#!/usr/bin/env bash
#
# CyberShield Agent - Job Polling & Execution
#

poll_jobs() {
    local ts poll_body
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
    poll_body=$(jq -n \
        --arg an "$AGENT_NAME" \
        --arg av "$AGENT_VERSION" \
        --arg ts "$ts" \
        '{agent_name: $an, agent_version: $av, timestamp: $ts}' 2>/dev/null) \
        || poll_body='{"agent_name":"'"$AGENT_NAME"'","agent_version":"'"$AGENT_VERSION"'","timestamp":"'"$ts"'"}'

    local result rc
    result=$(invoke_secure_request "POST" "/functions/v1/poll-jobs" "$poll_body" 15 2)
    rc=$?
    if [[ $rc -ne 0 ]]; then
        echo "[]"
        return 1
    fi
    if ! echo "$result" | jq -e 'type == "array"' >/dev/null 2>&1; then
        echo "[]"
        return 0
    fi
    echo "$result"
}

execute_job() {
    local job="$1"
    local start_time job_id job_type execution_id
    start_time=$(date +%s)
    execution_id=$(echo "$job" | jq -r '.execution_id // empty' 2>/dev/null)
    job_id=$(echo "$job" | jq -r '.id // empty' 2>/dev/null)
    job_type=$(echo "$job" | jq -r '.job_type // .type // empty' 2>/dev/null)

    log "INFO" "[JOB] Starting: ${job_type:-<unknown>} (ID: ${job_id:-<none>})"

    local hash_data output="" error_message="" status="completed" dispatch_rc=0
    hash_data=$(get_execution_hash "$execution_id" "$job_id" "$EXECUTION_CHAIN_LAST_HASH")

    output=$(_dispatch_job "$job_type" "$job" 2>/dev/null) || dispatch_rc=$?
    if [[ $dispatch_rc -ne 0 ]]; then
        error_message="Handler failed for job_type=${job_type} (rc=${dispatch_rc})"
        status="failed"
        [[ -z "$output" ]] && output='{}'
    fi
    # Ensure output is valid JSON; wrap raw text if not
    if ! echo "$output" | jq -e '.' >/dev/null 2>&1; then
        output=$(jq -n --arg raw "$output" '{raw_output: $raw}' 2>/dev/null || echo '{}')
    fi

    local end_time duration output_hash
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    output_hash=$(printf '%s' "$output" | sha256sum 2>/dev/null | cut -d' ' -f1)
    [[ -z "$output_hash" ]] && output_hash=$(printf '%s' "$output" | shasum -a 256 2>/dev/null | cut -d' ' -f1)

    local exec_hash prev_hash exec_index
    exec_hash=$(echo "$hash_data" | jq -r '.execution_hash // empty' 2>/dev/null)
    prev_hash=$(echo "$hash_data" | jq -r '.previous_execution_hash // empty' 2>/dev/null)
    exec_index=$(echo "$hash_data" | jq -r '.execution_index // 0' 2>/dev/null)

    jq -n \
        --arg status "$status" \
        --argjson output "$output" \
        --arg output_hash "$output_hash" \
        --arg error_message "$error_message" \
        --argjson duration "$duration" \
        --arg exec_hash "$exec_hash" \
        --arg prev_hash "$prev_hash" \
        --argjson exec_index "$exec_index" \
        '{success:true,status:$status,output:$output,output_hash:$output_hash,error_message:$error_message,duration_seconds:$duration,execution_hash:$exec_hash,previous_execution_hash:$prev_hash,execution_index:$exec_index}'
}

submit_job_result() {
    local job="$1" result="$2"
    local execution_id job_id status output_hash finished_at signature output error_message exec_hash prev_hash exec_index
    execution_id=$(echo "$job" | jq -r '.execution_id // empty' 2>/dev/null)
    job_id=$(echo "$job" | jq -r '.id // empty' 2>/dev/null)
    status=$(echo "$result" | jq -r '.status // "failed"' 2>/dev/null)
    output_hash=$(echo "$result" | jq -r '.output_hash // empty' 2>/dev/null)
    finished_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
    signature=$(sign_execution_result "$execution_id" "$job_id" "$status" "$output_hash" "$finished_at")
    output=$(echo "$result" | jq -c '.output // {}' 2>/dev/null || echo '{}')
    error_message=$(echo "$result" | jq -r '.error_message // ""' 2>/dev/null)
    exec_hash=$(echo "$result" | jq -r '.execution_hash // empty' 2>/dev/null)
    prev_hash=$(echo "$result" | jq -r '.previous_execution_hash // empty' 2>/dev/null)
    exec_index=$(echo "$result" | jq -r '.execution_index // 0' 2>/dev/null)

    local payload
    payload=$(jq -n \
        --arg eid "$execution_id" \
        --arg jid "$job_id" \
        --arg st "$status" \
        --argjson out "$output" \
        --arg oh "$output_hash" \
        --arg em "$error_message" \
        --arg fa "$finished_at" \
        --arg sig "$signature" \
        --arg eh "$exec_hash" \
        --arg ph "$prev_hash" \
        --argjson ei "$exec_index" \
        --arg av "$AGENT_VERSION" \
        '{execution_id: $eid, job_id: $jid, status: $st, output: $out, output_hash: $oh, error_message: $em, finished_at: $fa, result_signature: $sig, execution_hash: $eh, previous_execution_hash: $ph, execution_index: $ei, agent_version: $av}' 2>/dev/null)

    if [[ -z "$payload" ]]; then
        log "ERROR" "[JOB] Failed to build submission payload for job_id=$job_id"
        return 1
    fi

    invoke_secure_request "POST" "/functions/v1/submit-job-result" "$payload" 30 3
}

# Job Dispatcher (fallback for common job types when platform module has none).
# Platform entrypoints (linux/macos main.sh) override this with _dispatch_job
# that loads handlers.sh and routes to dispatch_job_handler.
_dispatch_job() {
    local type="$1" job="$2"
    case "$type" in
        "collect_network_info") collect_network_info ;;
        "update_agent")         update_agent_handler ;;
        "integration_test_v3")  integration_test_handler ;;
        *) return 1 ;;
    esac
}

# Common job handlers
collect_network_info() {
    local adapters ip_addresses ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
    adapters=$(ip -j link show 2>/dev/null | jq -c '[.[] | {name: .ifname, mac: .address, state: .operstate}]' 2>/dev/null || echo '[]')
    ip_addresses=$(ip -j -4 addr show 2>/dev/null | jq -c '[.[] | .addr_info[] | {ip: .local, prefix: .prefixlen}]' 2>/dev/null || echo '[]')
    jq -n --argjson a "$adapters" --argjson ip "$ip_addresses" --arg ts "$ts" \
        '{adapters: $a, ip_addresses: $ip, collected_at: $ts}' 2>/dev/null \
        || echo '{"adapters":[],"ip_addresses":[],"collected_at":""}'
}

update_agent_handler() {
    jq -n --arg av "$AGENT_VERSION" \
        '{success:true,message:"Update delegated to heartbeat force_update mechanism",agent_version:$av}'
}

integration_test_handler() {
    local ts host
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
    host=$(hostname 2>/dev/null || echo "unknown")
    jq -n --arg av "$AGENT_VERSION" --arg ts "$ts" --arg h "$host" \
        '{pong:true,agent_version:$av,timestamp:$ts,hostname:$h}'
}
