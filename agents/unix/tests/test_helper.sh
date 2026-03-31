#!/usr/bin/env bash
#
# BATS test helper - loads lib.sh in test mode
# Sets up mock environment for testing shared library functions.
#

export TEST_MODE=true
export BASE_DIR="/tmp/cybershield-test-$$"
export LOG_DIR="${BASE_DIR}/logs"
export CONFIG_DIR="${BASE_DIR}/config"
export KEYS_DIR="${BASE_DIR}/keys"
export DATA_DIR="${BASE_DIR}/data"
export LOG_FILE="${LOG_DIR}/agent.log"
export STATE_PATH="${DATA_DIR}/agent_state.json"
export PROCESS_BASELINE_PATH="${DATA_DIR}/process_baseline.json"
export HASH_CACHE_TXT="${DATA_DIR}/expected_script_hash.txt"
export HASH_CACHE_JSON="${DATA_DIR}/expected_script_hash.json"
export PRIVATE_KEY_PATH="${KEYS_DIR}/agent.key"
export PUBLIC_KEY_PATH="${KEYS_DIR}/agent.pub"
export FINGERPRINT_PATH="${KEYS_DIR}/fingerprint.txt"
export PREVIOUS_KEY_PATH="${KEYS_DIR}/agent.key.prev"

export SERVER_URL="https://test.example.com"
export AGENT_TOKEN="test-token-123"
export HMAC_SECRET="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
export AGENT_NAME="test-agent"
export NETWORK_TEST_HOST="test.example.com"

setup_test_env() {
    mkdir -p "$LOG_DIR" "$CONFIG_DIR" "$KEYS_DIR" "$DATA_DIR"
    chmod 700 "$KEYS_DIR"
}

teardown_test_env() {
    rm -rf "$BASE_DIR"
}
