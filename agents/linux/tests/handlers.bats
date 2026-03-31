#!/usr/bin/env bats
#
# Tests for Linux-specific job handlers
#

SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"

setup() {
    source "$SCRIPT_DIR/../../unix/tests/test_helper.sh"
    setup_test_env
    
    export AGENT_VERSION="v6.0.0"
    export PROTECTED_PROCESSES="init systemd journald sshd cron dbus"
    export PROTECTED_SERVICES="sshd dbus cron rsyslog"
    
    source "$SCRIPT_DIR/../modules/handlers.sh"
}

teardown() {
    teardown_test_env
}

# ============================================
#  DISPATCHER TESTS
# ============================================

@test "dispatch: integration_test_v3 returns pong" {
    # Mock integration_test_handler (from lib.sh)
    integration_test_handler() {
        echo '{"pong":true,"agent_version":"v6.0.0"}'
    }
    local result
    result=$(dispatch_job_handler "integration_test_v3" '{}')
    echo "$result" | jq -e '.pong == true' > /dev/null
}

@test "dispatch: unknown job type returns error" {
    run dispatch_job_handler "nonexistent_job_type" '{}'
    [[ "$output" == *"Unknown job type"* ]]
    [ "$status" -ne 0 ]
}

# ============================================
#  KILL PROCESS HANDLER TESTS
# ============================================

@test "kill_process: rejects missing process_name" {
    local result
    result=$(_kill_process_handler '{"payload":{}}')
    echo "$result" | jq -e '.success == false' > /dev/null
    [[ "$result" == *"Missing process_name"* ]]
}

@test "kill_process: blocks protected processes" {
    local result
    result=$(_kill_process_handler '{"payload":{"process_name":"sshd"}}')
    echo "$result" | jq -e '.blocked == true' > /dev/null
}

@test "kill_process: returns success for non-running process" {
    local result
    result=$(_kill_process_handler '{"payload":{"process_name":"definitely_not_running_12345"}}')
    echo "$result" | jq -e '.success == true' > /dev/null
    echo "$result" | jq -e '.killed == 0' > /dev/null
}

# ============================================
#  STOP SERVICE HANDLER TESTS
# ============================================

@test "stop_service: rejects missing service_name" {
    local result
    result=$(_stop_service_handler '{"payload":{}}')
    echo "$result" | jq -e '.success == false' > /dev/null
}

@test "stop_service: blocks protected services" {
    local result
    result=$(_stop_service_handler '{"payload":{"service_name":"sshd"}}')
    echo "$result" | jq -e '.blocked == true' > /dev/null
}

# ============================================
#  COLLECT INFO TESTS
# ============================================

@test "collect_info: returns kernel and architecture" {
    local result
    result=$(_collect_info)
    echo "$result" | jq -e '.kernel' > /dev/null
    echo "$result" | jq -e '.architecture' > /dev/null
    echo "$result" | jq -e '.agent_version' > /dev/null
}

# ============================================
#  DNS BLOCKS TESTS
# ============================================

@test "collect_dns_blocks: returns JSON array" {
    local result
    result=$(_collect_dns_blocks)
    echo "$result" | jq -e '.blocked_domains' > /dev/null
    echo "$result" | jq -e '.source == "/etc/hosts"' > /dev/null
}

# ============================================
#  SCAN HANDLER TESTS
# ============================================

@test "scan: returns open_ports and logged_users" {
    local result
    result=$(_scan_handler)
    echo "$result" | jq -e '.open_ports' > /dev/null
    echo "$result" | jq -e '.logged_users' > /dev/null
}
