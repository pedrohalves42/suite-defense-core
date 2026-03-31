#!/usr/bin/env bash
#
# CyberShield Agent - macOS v6.0 Entrypoint
# Lean orchestrator: loads shared lib + platform modules.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================================
#  PLATFORM PATHS
# ============================================
BASE_DIR="/Library/Application Support/CyberShield"
LOG_DIR="${BASE_DIR}/logs"
EVIDENCE_DIR="${BASE_DIR}/evidence"
CONFIG_DIR="${BASE_DIR}/config"
KEYS_DIR="${BASE_DIR}/keys"
DATA_DIR="${BASE_DIR}/data"
LOG_FILE="${LOG_DIR}/agent.log"
STATE_PATH="${DATA_DIR}/agent_state.json"
PROCESS_BASELINE_PATH="${DATA_DIR}/process_baseline.json"
HASH_CACHE_TXT="${DATA_DIR}/expected_script_hash.txt"
HASH_CACHE_JSON="${DATA_DIR}/expected_script_hash.json"
PRIVATE_KEY_PATH="${KEYS_DIR}/agent.key"
PUBLIC_KEY_PATH="${KEYS_DIR}/agent.pub"
FINGERPRINT_PATH="${KEYS_DIR}/fingerprint.txt"
PREVIOUS_KEY_PATH="${KEYS_DIR}/agent.key.prev"

# ============================================
#  ARGUMENT PARSING
# ============================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --server-url)   SERVER_URL="$2"; shift 2 ;;
        --agent-token)  AGENT_TOKEN="$2"; shift 2 ;;
        --hmac-secret)  HMAC_SECRET="$2"; shift 2 ;;
        --agent-name)   AGENT_NAME="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

SERVER_URL="${SERVER_URL:-}"
AGENT_TOKEN="${AGENT_TOKEN:-}"
HMAC_SECRET="${HMAC_SECRET:-}"
AGENT_NAME="${AGENT_NAME:-$(hostname | tr '[:upper:]' '[:lower:]')}"

if [[ -z "$SERVER_URL" || -z "$AGENT_TOKEN" || -z "$HMAC_SECRET" ]]; then
    echo "ERROR: Missing required parameters"
    echo "Usage: $0 --server-url URL --agent-token TOKEN --hmac-secret SECRET [--agent-name NAME]"
    exit 1
fi

SERVER_URL="${SERVER_URL%/}"
NETWORK_TEST_HOST=$(echo "$SERVER_URL" | sed -E 's|https?://||' | sed 's|/.*||')

# Create directories
mkdir -p "$LOG_DIR" "$EVIDENCE_DIR" "$CONFIG_DIR" "$KEYS_DIR" "$DATA_DIR"
chmod 700 "$KEYS_DIR"

# ============================================
#  LOAD PLATFORM MODULES
# ============================================
source "$SCRIPT_DIR/modules/platform.sh"
source "$SCRIPT_DIR/modules/metrics.sh"
source "$SCRIPT_DIR/modules/service.sh"
source "$SCRIPT_DIR/modules/repair.sh"
source "$SCRIPT_DIR/modules/update.sh"

# Source shared library (loads all common modules)
source "$SCRIPT_DIR/../unix/lib.sh"

trap 'flush_log_buffer' EXIT TERM INT

# ============================================
#  JOB DISPATCHER
# ============================================
_dispatch_job() {
    local job_type="$1" job="$2"
    source "$SCRIPT_DIR/modules/handlers.sh"
    dispatch_job_handler "$job_type" "$job"
}

# ============================================
#  PROTECTED LISTS
# ============================================
PROTECTED_PROCESSES="launchd kernel_task sshd cron mds WindowServer loginwindow Finder Dock SystemUIServer"
PROTECTED_SERVICES="sshd mds com.apple.Finder com.apple.Dock com.apple.WindowServer"

# ============================================
#  LAUNCH
# ============================================
run_main_loop
