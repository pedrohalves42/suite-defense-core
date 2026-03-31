#!/usr/bin/env bats
#
# Tests for macOS-specific job handlers
#

SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")" && pwd)"

setup() {
    source "$SCRIPT_DIR/../../unix/tests/test_helper.sh"
    setup_test_env
    
    export AGENT_VERSION="v6.0.0"
    export PROTECTED_PROCESSES="launchd kernel_task sshd Finder Dock"
    export PROTECTED_SERVICES="sshd com.apple.Finder"
    
    source "$SCRIPT_DIR/../modules/handlers.sh"
}

teardown() {
    teardown_test_env
}

# ============================================
#  DISPATCHER TESTS
# ============================================

@test "dispatch: unknown job type returns error" {
    run dispatch_job_handler "fake_job" '{}'
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
}

@test "kill_process: blocks protected macOS processes" {
    local result
    result=$(_kill_process_handler '{"payload":{"process_name":"Finder"}}')
    echo "$result" | jq -e '.blocked == true' > /dev/null
}

@test "kill_process: returns success for non-running process" {
    local result
    result=$(_kill_process_handler '{"payload":{"process_name":"nonexistent_proc_99999"}}')
    echo "$result" | jq -e '.success == true' > /dev/null
}

# ============================================
#  COLLECT INFO TESTS
# ============================================

@test "collect_info: returns kernel and architecture" {
    local result
    result=$(_collect_info)
    echo "$result" | jq -e '.kernel' > /dev/null
    echo "$result" | jq -e '.architecture' > /dev/null
}

# ============================================
#  DNS BLOCKS TESTS
# ============================================

@test "collect_dns_blocks: returns JSON with source" {
    local result
    result=$(_collect_dns_blocks)
    echo "$result" | jq -e '.source == "/etc/hosts"' > /dev/null
}

# ============================================
#  ANTIVIRUS STATUS
# ============================================

@test "collect_antivirus_status: returns JSON" {
    local result
    result=$(_collect_antivirus_status)
    echo "$result" | jq -e '.antivirus_products' > /dev/null
}
