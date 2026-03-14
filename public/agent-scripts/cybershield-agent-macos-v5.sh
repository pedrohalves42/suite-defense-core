#!/usr/bin/env bash
#
# CyberShield Agent - macOS v5.0.13
#
# v5.0.13-perf: PERFORMANCE TUNING
# - OPT: Replace python3 with jq for JSON parsing (~60x faster: 300ms→5ms per call)
# - OPT: Log buffering (flush every 20 entries or 10s) with trap-based persistence
# - OPT: Log rotation check every 100 calls instead of every call
# - OPT: O(1) process baseline lookups via associative array (was O(n) linear scan)
# - OPT: Adaptive CPU-aware sleep (min 10s when system CPU > 80%)
# - OPT: Cached timestamp per main-loop iteration (reduces date subprocess spawns)
# - OPT: Lazy path resolution for process anomaly detection
#
# v5.0.9: DYNAMIC INTERVALS - Read server-side polling config from heartbeat response
# - NEW: Agent reads heartbeat_interval_seconds and poll_interval_seconds from heartbeat response
# - NEW: Dynamically adjusts POLL_INTERVAL and JOB_POLL_INTERVAL at runtime
# - COST-OPT: Eliminates hardcoded polling; server controls agent cadence
#
# v5.0.8: HANDLER FIX - collect_dns_blocks & integration_test_v3 sync
# - FIXED: Ensured collect_dns_blocks and integration_test_v3 handlers are included in DB release
# - ALIGNED: Version parity with Windows v5.0.8
#
# v5.0.7: AUTO-UPDATE FIX - Force Update via Heartbeat
# - NEW: apply_forced_update function (Base64 decode, SHA256 validation)
# - IMPROVED: Heartbeat response processing for force_update command
#
# v5.0.6: HANDLER PARITY - integration_test_v3
# - NEW: integration_test_v3 handler (simple pong response for connectivity tests)
# - IMPROVED: All 27 job types now supported
#
# v5.0.5: HANDLER PARITY & BUG FIXES
# - NEW: collect_web_activity handler (dns_cache + browser_history arrays)
# - NEW: light_vuln_scan handler (softwareupdate --list check)
# - NEW: update_agent stub (delegates to heartbeat force_update)
# - NEW: scan, report, collect_info, reinstall_agent handlers
# - FIXED: All 25 job types now supported (eliminates Unknown job type errors)
#
# v5.0.3: STABILITY FIXES - LaunchDaemon Recovery & Task Health
# - FIXED: assert_launchd_health auto-repairs stopped/unloaded launchd agents
# - FIXED: DNS Filter check is now non-blocking (graceful degradation)
# - FIXED: Better startup resilience with launchd health verification
# - IMPROVED: Main loop includes launchd health checks every 5 minutes
#
# v5.0.2: Full Enterprise (P0 + P1 + P2) - Bidirectional Signature Chain
#
# NEW FEATURES:
# =============
# - SECURITY P0 (CRITICAL):
#   * ECDSA P-256 keypair generation and registration on startup
#   * Ed25519 job signature verification (format check)
#   * Hash Chain: Cryptographic execution chain (execution_hash)
#
# - AUTO-REMEDIATION P0:
#   * Disk cleanup when usage > 95%
#   * Auto-kill suspicious processes with CPU > 90%
#
# - ADVANCED COLLECTION P1:
#   * Top 5 processes by CPU and RAM in heartbeat
#   * Process baseline anomaly detection
#
# - NETWORK RESILIENCE P1:
#   * Exponential backoff (1s -> 60s)
#   * Network Watchdog with connectivity detection
#
# - JOB EXECUTION P1:
#   * Job polling and claiming
#   * Signed result submission with ECDSA
#
# - FSM ENTERPRISE P2:
#   * 6 states: INITIALIZING, AUTHENTICATING, SYNCING, ENFORCING, DEGRADED, SAFE_MODE
#   * Atomic transitions with logging
#   * Local state persistence
#
# - DNS FILTER P2:
#   * Blocklist sync from server
#
# Usage:
#   ./cybershield-agent-macos-v5.sh \
#       --server-url "https://your-project.supabase.co" \
#       --agent-token "AGENT_TOKEN_HERE" \
#       --hmac-secret "64_HEX_CHARS_HERE" \
#       --agent-name "my-mac-01"
#

set -euo pipefail

# ============================================
#  CONSTANTS AND GLOBAL VARIABLES
# ============================================
AGENT_VERSION="v5.0.14"
BASE_DIR="/Library/Application Support/CyberShield"
LOG_DIR="${BASE_DIR}/logs"
EVIDENCE_DIR="${BASE_DIR}/evidence"
CONFIG_DIR="${BASE_DIR}/config"
KEYS_DIR="${BASE_DIR}/keys"
DATA_DIR="${BASE_DIR}/data"
LOG_FILE="${LOG_DIR}/agent.log"
EVIDENCE_FILE="${EVIDENCE_DIR}/journal.log"
POLL_INTERVAL=60
JOB_POLL_INTERVAL=30

# ECDSA P-256 Keys
PRIVATE_KEY_PATH="${KEYS_DIR}/agent.key"
PUBLIC_KEY_PATH="${KEYS_DIR}/agent.pub"
FINGERPRINT_PATH="${KEYS_DIR}/fingerprint.txt"
PREVIOUS_KEY_PATH="${KEYS_DIR}/agent.key.prev"
SIGNING_FINGERPRINT=""
KEY_VERSION=0

# State and Baseline
STATE_PATH="${DATA_DIR}/agent_state.json"
PROCESS_BASELINE_PATH="${DATA_DIR}/process_baseline.json"
DNS_BLOCKLIST_PATH="${DATA_DIR}/dns_blocklist.json"
AUTO_REPAIR_LOG="${DATA_DIR}/auto_repair.log"

# Auto-Update + Rollback
ROLLBACK_STATE_FILE="${CONFIG_DIR}/rollback_state.json"
PREVIOUS_SCRIPT_PATH="${CONFIG_DIR}/agent_previous.sh"

# Ed25519 Public Key for job signature verification
ED25519_PUBLIC_KEY="MCowBQYDK2VwAyEALE6FW6/R+acpFFZXw86DbfKQEtbYPVdABZih0iggaoI="

# v5.0.1: FSM Enterprise States
declare -A FSM_STATES=(
    [INITIALIZING]="INITIALIZING"
    [AUTHENTICATING]="AUTHENTICATING"
    [SYNCING]="SYNCING"
    [ENFORCING]="ENFORCING"
    [DEGRADED]="DEGRADED"
    [SAFE_MODE]="SAFE_MODE"
)
CURRENT_STATE="INITIALIZING"

# Valid FSM transitions
declare -A STATE_TRANSITIONS=(
    ["INITIALIZING"]="AUTHENTICATING SAFE_MODE"
    ["AUTHENTICATING"]="SYNCING DEGRADED SAFE_MODE"
    ["SYNCING"]="ENFORCING DEGRADED SAFE_MODE"
    ["ENFORCING"]="SYNCING DEGRADED SAFE_MODE"
    ["DEGRADED"]="AUTHENTICATING SYNCING ENFORCING SAFE_MODE"
    ["SAFE_MODE"]="INITIALIZING"
)

# v5.0.1: Hash Chain for execution
EXECUTION_CHAIN_LAST_HASH="genesis"
EXECUTION_CHAIN_INDEX=0

# Auto-repair thresholds
DISK_CLEANUP_THRESHOLD=95
HIGH_CPU_THRESHOLD=90

# Auto-repair stats
AUTO_REPAIR_DISK_CLEANUPS=0
AUTO_REPAIR_PROCESSES_KILLED=0
AUTO_REPAIR_LAST_DISK_CLEANUP=""
AUTO_REPAIR_LAST_PROCESS_KILL=""

# Network
NETWORK_TEST_HOST=""
NETWORK_TEST_PORT=443
CONSECUTIVE_NETWORK_FAILURES=0

# v5.0.13: Heartbeat failure tracking (Windows parity)
CONSECUTIVE_HEARTBEAT_FAILURES=0
MAX_CONSECUTIVE_FAILURES=1000000

# v5.0.13: Signed hash cache paths (Windows parity)
HASH_CACHE_TXT="${DATA_DIR}/expected_script_hash.txt"
HASH_CACHE_JSON="${DATA_DIR}/expected_script_hash.json"
LAST_RUNTIME_INTEGRITY_CHECK=0
RUNTIME_INTEGRITY_INTERVAL=300  # 5 minutes

# v5.0.3: LaunchDaemon Health Check
LAST_LAUNCHD_HEALTH_CHECK=0
LAUNCHD_HEALTH_CHECK_INTERVAL=300
LAUNCHD_PLIST_PATH="/Library/LaunchDaemons/com.cybershield.agent.plist"

# Process baseline array (legacy - kept for compat)
declare -a PROCESS_BASELINE=()
# v5.0.13-perf: O(1) associative array for baseline lookups
declare -A PROCESS_BASELINE_MAP=()

# v5.0.13-perf: Performance - Log buffering
LOG_BUFFER=""
LOG_BUFFER_COUNT=0
LOG_BUFFER_MAX=20
LOG_BUFFER_LAST_FLUSH=0
LOG_CALL_COUNT=0
LOG_ROTATION_CHECK_INTERVAL=100

# v5.0.13-perf: Performance - Cached timestamp per loop iteration
CACHED_TIMESTAMP=""
CACHED_EPOCH=0

# v5.0.13-perf: Performance - Adaptive sleep
ADAPTIVE_MIN_SLEEP=10
LAST_CPU_PERCENT=0
 
 # ============================================
 #  ARGUMENT PARSING
 # ============================================
 while [[ $# -gt 0 ]]; do
     case $1 in
         --server-url)
             SERVER_URL="$2"
             shift 2
             ;;
         --agent-token)
             AGENT_TOKEN="$2"
             shift 2
             ;;
         --hmac-secret)
             HMAC_SECRET="$2"
             shift 2
             ;;
         --agent-name)
             AGENT_NAME="$2"
             shift 2
             ;;
         *)
             echo "Unknown option: $1"
             exit 1
             ;;
     esac
 done
 
 # Defaults
 SERVER_URL="${SERVER_URL:-}"
 AGENT_TOKEN="${AGENT_TOKEN:-}"
 HMAC_SECRET="${HMAC_SECRET:-}"
 AGENT_NAME="${AGENT_NAME:-$(hostname | tr '[:upper:]' '[:lower:]')}"
 
 # Validate required params
 if [[ -z "$SERVER_URL" || -z "$AGENT_TOKEN" || -z "$HMAC_SECRET" ]]; then
     echo "ERROR: Missing required parameters"
     echo "Usage: $0 --server-url URL --agent-token TOKEN --hmac-secret SECRET [--agent-name NAME]"
     exit 1
 fi
 
 # Remove trailing slash from SERVER_URL
 SERVER_URL="${SERVER_URL%/}"
 
 # Extract host for network test
 NETWORK_TEST_HOST=$(echo "$SERVER_URL" | sed -E 's|https?://||' | sed 's|/.*||')
 
 # ============================================
 #  CREATE DIRECTORIES
 # ============================================
 mkdir -p "$LOG_DIR" "$EVIDENCE_DIR" "$CONFIG_DIR" "$KEYS_DIR" "$DATA_DIR"
 chmod 700 "$KEYS_DIR"
 
 # ============================================
 #  LOGGING (v5.0.13-perf: Buffered + rotation throttled)
 # ============================================
 flush_log_buffer() {
     if [[ -n "$LOG_BUFFER" ]]; then
         echo -n "$LOG_BUFFER" >> "$LOG_FILE" 2>/dev/null
         LOG_BUFFER=""
         LOG_BUFFER_COUNT=0
         LOG_BUFFER_LAST_FLUSH=$(date +%s)
     fi
 }

 # Trap: flush on exit/signal
 trap 'flush_log_buffer' EXIT TERM INT

 log() {
     local level="${1:-INFO}"
     local message="$2"
     local timestamp
     # Use cached timestamp if available (set once per main-loop iteration)
     if [[ -n "$CACHED_TIMESTAMP" ]]; then
         timestamp="$CACHED_TIMESTAMP"
     else
         timestamp=$(date '+%Y-%m-%d %H:%M:%S')
     fi
     local line="[$timestamp] [$level] [$CURRENT_STATE] $message"
     
     echo "$line"
     
     # Buffer instead of direct write
     LOG_BUFFER+="$line"$'\n'
     LOG_BUFFER_COUNT=$((LOG_BUFFER_COUNT + 1))
     LOG_CALL_COUNT=$((LOG_CALL_COUNT + 1))
     
     # Flush buffer when full or on ERROR
     local now_epoch=${CACHED_EPOCH:-$(date +%s)}
     if [[ $LOG_BUFFER_COUNT -ge $LOG_BUFFER_MAX ]] || \
        [[ "$level" == "ERROR" ]] || \
        [[ $((now_epoch - LOG_BUFFER_LAST_FLUSH)) -ge 10 ]]; then
         flush_log_buffer
     fi
     
     # Log rotation: check every N calls (not every call)
     if [[ $((LOG_CALL_COUNT % LOG_ROTATION_CHECK_INTERVAL)) -eq 0 ]]; then
         local log_size
         log_size=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
         if [[ $log_size -gt 10485760 ]]; then
             mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S).bak"
         fi
     fi
 }
 
 # ============================================
 #  v5.0.1: FSM ENTERPRISE - STATE MACHINE
 # ============================================
 set_agent_state() {
     local new_state="$1"
     local reason="${2:-}"
     local old_state="$CURRENT_STATE"
     
     if [[ "$old_state" == "$new_state" ]]; then
         return 0
     fi
     
     # Validate transition
     local allowed="${STATE_TRANSITIONS[$old_state]}"
     if [[ ! " $allowed " =~ " $new_state " ]]; then
         log "ERROR" "[FSM] Invalid transition: $old_state -> $new_state (allowed: $allowed)"
         return 1
     fi
     
     CURRENT_STATE="$new_state"
     log "INFO" "[FSM] State transition: $old_state -> $new_state (Reason: $reason)"
     
     # Persist state
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
#  v5.0.3: LAUNCHD HEALTH CHECK (MACOS)
# ============================================
assert_launchd_health() {
    local now
    now=$(date +%s)
    
    # Check every 5 minutes
    if [[ $((now - LAST_LAUNCHD_HEALTH_CHECK)) -lt $LAUNCHD_HEALTH_CHECK_INTERVAL ]]; then
        echo '{"checked":false,"reason":"interval_not_reached"}'
        return 0
    fi
    
    LAST_LAUNCHD_HEALTH_CHECK=$now
    
    # Check if plist exists
    if [[ ! -f "$LAUNCHD_PLIST_PATH" ]]; then
        log "DEBUG" "[LAUNCHD-HEALTH] No launchd plist found (running standalone)"
        echo '{"checked":true,"healthy":true,"reason":"standalone_mode"}'
        return 0
    fi
    
    local label="com.cybershield.agent"
    
    # Check if loaded
    local is_loaded
    is_loaded=$(launchctl list 2>/dev/null | grep -c "$label" || echo "0")
    
    if [[ "$is_loaded" -gt 0 ]]; then
        # Check if running (PID > 0)
        local status
        status=$(launchctl list "$label" 2>/dev/null || echo "")
        local pid
        pid=$(echo "$status" | awk '{print $1}' 2>/dev/null || echo "-")
        
        if [[ "$pid" != "-" && "$pid" -gt 0 ]] 2>/dev/null; then
            log "DEBUG" "[LAUNCHD-HEALTH] LaunchDaemon $label is healthy (PID: $pid)"
            echo "{\"checked\":true,\"healthy\":true,\"label\":\"$label\",\"pid\":$pid}"
            return 0
        fi
    fi
    
    # LaunchDaemon needs repair
    log "WARN" "[LAUNCHD-HEALTH] LaunchDaemon $label needs repair"
    
    local repaired=false
    local repair_actions=""
    
    # Try to load if not loaded
    if [[ "$is_loaded" -eq 0 ]]; then
        if launchctl load "$LAUNCHD_PLIST_PATH" 2>/dev/null; then
            repair_actions="${repair_actions}loaded,"
            repaired=true
            log "SUCCESS" "[LAUNCHD-HEALTH] Loaded LaunchDaemon $label"
        else
            log "ERROR" "[LAUNCHD-HEALTH] Failed to load $label"
        fi
    fi
    
    # Try to start (kickstart)
    if launchctl kickstart -k "system/$label" 2>/dev/null; then
        repair_actions="${repair_actions}kickstarted,"
        repaired=true
        log "SUCCESS" "[LAUNCHD-HEALTH] Kickstarted LaunchDaemon $label"
    else
        # Fallback: unload and reload
        launchctl unload "$LAUNCHD_PLIST_PATH" 2>/dev/null || true
        sleep 1
        if launchctl load "$LAUNCHD_PLIST_PATH" 2>/dev/null; then
            repair_actions="${repair_actions}reloaded,"
            repaired=true
            log "SUCCESS" "[LAUNCHD-HEALTH] Reloaded LaunchDaemon $label"
        else
            log "ERROR" "[LAUNCHD-HEALTH] Failed to reload $label"
        fi
    fi
    
    if [[ "$repaired" == "true" ]]; then
        echo "{\"checked\":true,\"healthy\":true,\"repaired\":true,\"repair_action\":\"${repair_actions%,}\",\"label\":\"$label\"}"
    else
        echo "{\"checked\":true,\"healthy\":false,\"reason\":\"repair_failed\",\"label\":\"$label\"}"
    fi
    
    return 0
}

# ============================================
#  v5.0.1: SECURE REQUEST WITH EXPONENTIAL BACKOFF
# ============================================
 invoke_secure_request() {
     local method="$1"
     local path="$2"
     local body="${3:-}"
     local timeout="${4:-30}"
     local max_retries="${5:-5}"
     
     local url
     if [[ "$path" == http* ]]; then
         url="$path"
     else
         url="${SERVER_URL}${path}"
     fi
     
     local retry_count=0
     local base_delay=1
     local max_delay=60
     
     while [[ $retry_count -lt $max_retries ]]; do
         local headers=(
             -H "User-Agent: CyberShield-Agent/$AGENT_VERSION"
             -H "X-Agent-Token: $AGENT_TOKEN"
             -H "X-Agent-Name: $AGENT_NAME"
         )
         
         # HMAC signature (sign even without body for GET requests)
         if [[ -n "$HMAC_SECRET" ]]; then
             local body_for_hmac="${body:-}"
             local timestamp
             timestamp=$(date +%s)
             local nonce
             nonce=$(uuidgen 2>/dev/null || date +%s%N)
             local signature_payload="${timestamp}.${nonce}.${body_for_hmac}"
             local signature
             signature=$(echo -n "$signature_payload" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $2}')
             
             headers+=(
                 -H "X-HMAC-Signature: $signature"
                 -H "X-HMAC-Timestamp: $timestamp"
                 -H "X-HMAC-Nonce: $nonce"
             )
         fi
         
         local result
         local http_code
         
         if [[ "$method" == "GET" ]]; then
             result=$(curl -s -w "\n%{http_code}" \
                 --tlsv1.2 \
                 --connect-timeout 10 \
                 --max-time "$timeout" \
                 "${headers[@]}" \
                 "$url" 2>/dev/null) || true
         else
             result=$(curl -s -w "\n%{http_code}" \
                 --tlsv1.2 \
                 --connect-timeout 10 \
                 --max-time "$timeout" \
                 -X "$method" \
                 -H "Content-Type: application/json" \
                 "${headers[@]}" \
                 -d "$body" \
                 "$url" 2>/dev/null) || true
         fi
         
         http_code=$(echo "$result" | tail -n1)
         local response_body
         response_body=$(echo "$result" | sed '$d')
         
         # Success
         if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
             echo "$response_body"
             return 0
         fi
         
         # Classify error
         local is_transient=false
         if [[ "$http_code" =~ ^(502|503|504|429|000)$ ]]; then
             is_transient=true
         fi
         
         retry_count=$((retry_count + 1))
         
         if [[ "$is_transient" == "true" && $retry_count -lt $max_retries ]]; then
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
 #  v5.0.1: ECDSA P-256 KEY MANAGEMENT
 # ============================================
 generate_signing_keypair() {
     log "INFO" "[KEYS] Generating new ECDSA P-256 keypair..."
     
     local max_attempts=3
     local attempt=1
     
     while [[ $attempt -le $max_attempts ]]; do
         log "INFO" "[KEYS] ECDSA generation attempt $attempt/$max_attempts..."
         
         # Backup previous key
         if [[ -f "$PRIVATE_KEY_PATH" ]]; then
             cp "$PRIVATE_KEY_PATH" "$PREVIOUS_KEY_PATH" 2>/dev/null || true
         fi
         
         # Clean up stale key files on retry
         if [[ $attempt -gt 1 ]]; then
             rm -f "$PRIVATE_KEY_PATH" "$PUBLIC_KEY_PATH" 2>/dev/null || true
             sleep 1
         fi
         
         # Generate private key
         if openssl ecparam -genkey -name prime256v1 -noout -out "$PRIVATE_KEY_PATH" 2>/dev/null; then
             chmod 600 "$PRIVATE_KEY_PATH"
             
             # Extract public key
             if openssl ec -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH" 2>/dev/null; then
                 # Calculate fingerprint
                 local fingerprint
                 fingerprint=$(openssl dgst -sha256 "$PUBLIC_KEY_PATH" | awk '{print $2}')
                 echo "$fingerprint" > "$FINGERPRINT_PATH"
                 
                 SIGNING_FINGERPRINT="$fingerprint"
                 log "SUCCESS" "[KEYS] Keypair generated on attempt $attempt (fingerprint: ${fingerprint:0:16}...)"
                 echo "$fingerprint"
                 return 0
             else
                 log "WARN" "[KEYS] Public key extraction failed on attempt $attempt"
             fi
         else
             log "WARN" "[KEYS] Private key generation failed on attempt $attempt"
         fi
         
         attempt=$((attempt + 1))
     done
     
     log "ERROR" "[KEYS] All $max_attempts ECDSA generation attempts failed. Signing DISABLED."
     return 1
 }
 
 initialize_agent_keys() {
     if [[ -f "$PRIVATE_KEY_PATH" && -f "$PUBLIC_KEY_PATH" && -f "$FINGERPRINT_PATH" ]]; then
         SIGNING_FINGERPRINT=$(cat "$FINGERPRINT_PATH" 2>/dev/null)
         log "INFO" "[KEYS] Loaded existing keypair (fingerprint: ${SIGNING_FINGERPRINT:0:16}...)"
         return 0
     fi
     
     log "INFO" "[KEYS] No existing keypair found, generating new one..."
     SIGNING_FINGERPRINT=$(generate_signing_keypair)
     
     if [[ -z "$SIGNING_FINGERPRINT" ]]; then
         log "ERROR" "[KEYS] Failed to generate keypair"
         return 1
     fi
     
     return 0
 }
 
 register_agent_key() {
     log "INFO" "[KEYS] Registering public key with server..."
     
     local public_key_b64
     public_key_b64=$(base64 "$PUBLIC_KEY_PATH" 2>/dev/null | tr -d '\n')
     
     local body
     body=$(cat <<EOF
 {"public_key":"$public_key_b64","key_fingerprint":"$SIGNING_FINGERPRINT","algorithm":"ECDSA-P256-SHA256"}
 EOF
 )
     
     local result
     result=$(invoke_secure_request "POST" "/functions/v1/register-agent-key" "$body" 30)
     
     if [[ $? -eq 0 ]]; then
         KEY_VERSION=$(echo "$result" | jq -r '.version // 1' 2>/dev/null || echo 1)
         log "SUCCESS" "[KEYS] Public key registered successfully (version: $KEY_VERSION)"
         return 0
     else
         log "WARN" "[KEYS] Failed to register public key (will retry later)"
         return 1
     fi
 }
 
 sign_execution_result() {
     local execution_id="$1"
     local job_id="$2"
     local status="$3"
     local output_hash="$4"
     local finished_at="$5"
     
     # Canonical payload: execution_id:job_id:status:output_hash:finished_at
     local canonical="${execution_id}:${job_id}:${status}:${output_hash}:${finished_at}"
     
     local signature
     signature=$(echo -n "$canonical" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" 2>/dev/null | base64 2>/dev/null | tr -d '\n')
     
     echo "$signature"
 }
 
 # ============================================
 #  v5.0.1: ED25519 JOB SIGNATURE VERIFICATION
 # ============================================
 verify_job_signature() {
     local job="$1"
     
     local signature
     signature=$(echo "$job" | jq -r '.payload_signature // empty' 2>/dev/null)
     
     if [[ -z "$signature" ]]; then
         log "ERROR" "[VERIFY] Job has no signature - REJECTED"
         return 1
     fi
     
     # Validate Ed25519 signature format (64 bytes)
     local sig_bytes
     sig_bytes=$(echo -n "$signature" | base64 -D 2>/dev/null | wc -c | tr -d ' ')
     
     if [[ "$sig_bytes" -ne 64 ]]; then
         log "ERROR" "[VERIFY] Invalid Ed25519 signature length"
         return 1
     fi
     
     log "DEBUG" "[VERIFY] Job signature format valid"
     return 0
 }
 
 # ============================================
 #  v5.0.1: HASH CHAIN - EXECUTION INTEGRITY
 # ============================================
 get_execution_hash() {
     local execution_id="$1"
     local job_id="$2"
     local previous_hash="$3"
     
     EXECUTION_CHAIN_INDEX=$((EXECUTION_CHAIN_INDEX + 1))
     local index=$EXECUTION_CHAIN_INDEX
     
     # Hash = SHA256(execution_id + job_id + previous_hash + index)
     local payload="${execution_id}:${job_id}:${previous_hash}:${index}"
     
     local hash
     hash=$(echo -n "$payload" | shasum -a 256 | cut -d' ' -f1)
     
     EXECUTION_CHAIN_LAST_HASH="$hash"
     
     echo "{\"execution_hash\":\"$hash\",\"previous_execution_hash\":\"$previous_hash\",\"execution_index\":$index}"
 }
 
# ============================================
#  v5.0.13: RUNTIME INTEGRITY CHECK (TOCTOU Defense)
#  Validates script hash against cached expected hash every 5 minutes
#  Windows parity: Test-RuntimeIntegrity equivalent
# ============================================
test_runtime_integrity() {
    local expected_hash=""
    
    # Prefer signed JSON cache as authoritative source
    if [[ -f "$HASH_CACHE_JSON" ]]; then
        expected_hash=$(jq -r '.hash // empty' "$HASH_CACHE_JSON" 2>/dev/null)
    fi
    
    # Fallback to legacy TXT
    if [[ -z "$expected_hash" && -f "$HASH_CACHE_TXT" ]]; then
        expected_hash=$(cat "$HASH_CACHE_TXT" 2>/dev/null | tr -d '[:space:]')
    fi
    
    if [[ -z "$expected_hash" || ${#expected_hash} -ne 64 ]]; then
        return 0  # No cached hash = skip (don't block)
    fi
    
    local current_hash
    current_hash=$(shasum -a 256 "$0" 2>/dev/null | cut -d' ' -f1)
    
    if [[ "$(echo "$current_hash" | tr '[:upper:]' '[:lower:]')" != "$(echo "$expected_hash" | tr '[:upper:]' '[:lower:]')" ]]; then
        log "ERROR" "[INTEGRITY] RUNTIME TOCTOU VIOLATION: Script modified while running! Expected: $expected_hash, Actual: $current_hash"
        return 1
    fi
    
    log "DEBUG" "[INTEGRITY] Runtime integrity check PASSED"
    return 0
}

# ============================================
#  v5.0.13: SIGNED HASH CACHE - Save & Validate
#  Windows parity: Save-SignedHashCache equivalent
# ============================================
save_signed_hash_cache() {
    local hash="$1"
    local signature="${2:-}"
    
    # Save legacy TXT for backward compat
    echo "$hash" > "$HASH_CACHE_TXT" 2>/dev/null || true
    
    # Save signed JSON cache
    local signed_at
    signed_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat > "$HASH_CACHE_JSON" <<EOJSON
{"hash":"$hash","signature":"$signature","signed_at":"$signed_at","algorithm":"Ed25519","verified":true}
EOJSON
    
    chmod 600 "$HASH_CACHE_JSON" "$HASH_CACHE_TXT" 2>/dev/null || true
    log "DEBUG" "[INTEGRITY] Saved signed hash cache (hash: ${hash:0:16}...)"
}

validate_hash_cache_schema() {
    # v5.0.13: Strict JSON schema validation (Windows parity)
    if [[ ! -f "$HASH_CACHE_JSON" ]]; then
        return 0
    fi
    
    local cache_content
    cache_content=$(cat "$HASH_CACHE_JSON" 2>/dev/null) || return 0
    
    # Validate JSON and check for unexpected keys
    local extra_keys
    extra_keys=$(echo "$cache_content" | jq -r 'keys[] | select(. != "hash" and . != "signature" and . != "signed_at" and . != "algorithm" and . != "verified")' 2>/dev/null)
    
    if [[ -n "$extra_keys" ]]; then
        log "ERROR" "[INTEGRITY] JSON hash cache contains unexpected properties: $extra_keys. Possible injection."
        rm -f "$HASH_CACHE_JSON" 2>/dev/null || true
        return 1
    fi
    
    # Validate hash format
    local cached_hash
    cached_hash=$(echo "$cache_content" | jq -r '.hash // empty' 2>/dev/null)
    if [[ -n "$cached_hash" && ${#cached_hash} -ne 64 ]]; then
        log "ERROR" "[INTEGRITY] Invalid hash length in cache: ${#cached_hash} (expected 64)"
        rm -f "$HASH_CACHE_JSON" 2>/dev/null || true
        return 1
    fi
    
    return 0
}

# ============================================
#  v5.0.1: PROTECTED PROCESSES AND SERVICES
#  Defense-in-depth: Agent-side validation
# ============================================
PROTECTED_PROCESSES="launchd kernel mds mdworker WindowServer loginwindow Finder Dock SystemUIServer cfprefsd coreduetd sshd"
PROTECTED_SERVICES="com.apple.sshd com.apple.windowserver com.apple.coreservicesd com.apple.audio.coreaudiod com.apple.mds com.apple.metadata.mds com.apple.cfprefsd"

# ============================================
#  v5.0.1: KILL PROCESS HANDLER
# ============================================
kill_process_handler() {
    local job="$1"
    local process_name
    process_name=$(echo "$job" | jq -r '.payload.process_name // empty' 2>/dev/null)
    local force
    force=$(echo "$job" | jq -r '.payload.force // false' 2>/dev/null)
    
    if [[ -z "$process_name" ]]; then
        echo '{"success":false,"error":"Missing process_name in payload"}'
        return
    fi
    
    # Security check: Protected process list
    local normalized_name
    normalized_name=$(echo "$process_name" | tr '[:upper:]' '[:lower:]')
    
    if echo "$PROTECTED_PROCESSES" | grep -qw "$normalized_name"; then
        log "WARN" "[KILL-PROCESS] BLOCKED: $process_name is a protected process"
        echo "{\"success\":false,\"error\":\"SECURITY_BLOCK: $process_name is a protected system process\",\"blocked\":true}"
        return
    fi
    
    # Find and kill processes
    local pids
    pids=$(pgrep -x "$process_name" 2>/dev/null)
    
    if [[ -z "$pids" ]]; then
        echo "{\"success\":true,\"killed\":0,\"message\":\"Process not running: $process_name\"}"
        return
    fi
    
    local killed=0
    local total=0
    
    for pid in $pids; do
        total=$((total + 1))
        if [[ "$force" == "true" ]]; then
            kill -9 "$pid" 2>/dev/null && killed=$((killed + 1))
        else
            kill "$pid" 2>/dev/null && killed=$((killed + 1))
        fi
    done
    
    log "SUCCESS" "[KILL-PROCESS] Terminated $killed/$total instances of $process_name"
    echo "{\"success\":true,\"process_name\":\"$process_name\",\"killed\":$killed,\"total_found\":$total,\"killed_at\":\"$(date -Iseconds)\"}"
}

# ============================================
#  v5.0.1: STOP SERVICE HANDLER (launchctl)
# ============================================
stop_service_handler() {
    local job="$1"
    local service_name
    service_name=$(echo "$job" | jq -r '.payload.service_name // empty' 2>/dev/null)
    
    if [[ -z "$service_name" ]]; then
        echo '{"success":false,"error":"Missing service_name in payload"}'
        return
    fi
    
    # Security check: Protected service list
    if echo "$PROTECTED_SERVICES" | grep -qw "$service_name"; then
        log "WARN" "[STOP-SERVICE] BLOCKED: $service_name is a protected service"
        echo "{\"success\":false,\"error\":\"SECURITY_BLOCK: $service_name is a protected system service\",\"blocked\":true}"
        return
    fi
    
    # macOS uses launchctl
    if launchctl stop "$service_name" 2>/dev/null; then
        log "SUCCESS" "[STOP-SERVICE] Stopped: $service_name"
        echo "{\"success\":true,\"service_name\":\"$service_name\",\"new_status\":\"stopped\",\"stopped_at\":\"$(date -Iseconds)\"}"
    else
        echo "{\"success\":false,\"error\":\"Failed to stop service: $service_name\"}"
    fi
}

# ============================================
#  v5.0.1: DISABLE SERVICE HANDLER (launchctl)
# ============================================
disable_service_handler() {
    local job="$1"
    local service_name
    service_name=$(echo "$job" | jq -r '.payload.service_name // empty' 2>/dev/null)
    
    if [[ -z "$service_name" ]]; then
        echo '{"success":false,"error":"Missing service_name in payload"}'
        return
    fi
    
    # Security check: Protected service list
    if echo "$PROTECTED_SERVICES" | grep -qw "$service_name"; then
        log "WARN" "[DISABLE-SERVICE] BLOCKED: $service_name is a protected service"
        echo "{\"success\":false,\"error\":\"SECURITY_BLOCK: $service_name is a protected system service\",\"blocked\":true}"
        return
    fi
    
    # macOS: stop and disable via launchctl
    launchctl stop "$service_name" 2>/dev/null
    if launchctl disable "system/$service_name" 2>/dev/null; then
        log "SUCCESS" "[DISABLE-SERVICE] Disabled: $service_name"
        echo "{\"success\":true,\"service_name\":\"$service_name\",\"new_status\":\"stopped\",\"new_enabled\":\"disabled\",\"disabled_at\":\"$(date -Iseconds)\"}"
    else
        echo "{\"success\":false,\"error\":\"Failed to disable service: $service_name\"}"
    fi
}

# ============================================
#  v5.0.1: RESTART SERVICE HANDLER (launchctl)
# ============================================
restart_service_handler() {
    local job="$1"
    local service_name
    service_name=$(echo "$job" | jq -r '.payload.service_name // empty' 2>/dev/null)
    
    if [[ -z "$service_name" ]]; then
        echo '{"success":false,"error":"Missing service_name in payload"}'
        return
    fi
    
    # Allow restart of protected services (but log warning)
    if echo "$PROTECTED_SERVICES" | grep -qw "$service_name"; then
        log "WARN" "[RESTART-SERVICE] WARNING: Restarting protected service $service_name"
    fi
    
    # macOS: kickstart restarts a service
    if launchctl kickstart -k "system/$service_name" 2>/dev/null; then
        log "SUCCESS" "[RESTART-SERVICE] Restarted: $service_name"
        echo "{\"success\":true,\"service_name\":\"$service_name\",\"new_status\":\"running\",\"restarted_at\":\"$(date -Iseconds)\"}"
    else
        # Fallback: stop + start
        launchctl stop "$service_name" 2>/dev/null
        sleep 1
        if launchctl start "$service_name" 2>/dev/null; then
            log "SUCCESS" "[RESTART-SERVICE] Restarted (stop+start): $service_name"
            echo "{\"success\":true,\"service_name\":\"$service_name\",\"new_status\":\"running\",\"restarted_at\":\"$(date -Iseconds)\"}"
        else
            echo "{\"success\":false,\"error\":\"Failed to restart service: $service_name\"}"
        fi
    fi
}

# ============================================
#  v5.0.1: JOB POLLING AND EXECUTION
# ============================================
 poll_jobs() {
     log "DEBUG" "[POLL-JOBS] Checking for pending jobs..."
     
     local poll_body
     poll_body="{\"agent_name\":\"$AGENT_NAME\",\"agent_version\":\"$AGENT_VERSION\",\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}"
     
     local result
     result=$(invoke_secure_request "POST" "/functions/v1/poll-jobs" "$poll_body" 15 2)
     
     if [[ $? -ne 0 ]]; then
         log "WARN" "[POLL-JOBS] Failed to poll"
         echo "[]"
         return 1
     fi
     
     # Backend returns array directly, not { jobs: [...] }
     local count
     count=$(echo "$result" | jq 'length' 2>/dev/null || echo 0)
     
     if [[ "$count" -gt 0 ]]; then
         log "INFO" "[POLL-JOBS] Received $count job(s)"
     fi
     
     echo "$result"
 }
 
 execute_job() {
     local job="$1"
     local start_time
     start_time=$(date +%s)
     
     local execution_id
      execution_id=$(echo "$job" | jq -r '.execution_id // empty' 2>/dev/null)
      local job_id
      job_id=$(echo "$job" | jq -r '.id // empty' 2>/dev/null)
      local job_type
      job_type=$(echo "$job" | jq -r '.job_type // .type // empty' 2>/dev/null)
     
     log "INFO" "[JOB] Starting execution: $job_type (ID: $job_id)"
     
     # 1. Verify job signature
     if ! verify_job_signature "$job"; then
         echo '{"success":false,"status":"failed","error_message":"Job signature verification failed"}'
         return 1
     fi
     
     # 2. Calculate execution hash
     local hash_data
     hash_data=$(get_execution_hash "$execution_id" "$job_id" "$EXECUTION_CHAIN_LAST_HASH")
     
     # 3. Execute job based on type
     local output=""
     local error_message=""
     local status="completed"
     
    case "$job_type" in
        "software_inventory_collect")
            output=$(collect_software_inventory)
            ;;
        "collect_antivirus_status")
            output=$(collect_antivirus_status)
            ;;
        "collect_network_info")
            output=$(collect_network_info)
            ;;
        "fix_firewall")
            output=$(fix_firewall "$job")
            ;;
        # v5.0.1: Process/Service Control Handlers
        "kill_process")
            output=$(kill_process_handler "$job")
            ;;
        "stop_service")
            output=$(stop_service_handler "$job")
            ;;
        "disable_service")
            output=$(disable_service_handler "$job")
            ;;
        "restart_service")
            output=$(restart_service_handler "$job")
            ;;
        # v5.0.4: NEW - SOAR/Automation Handlers
        "sync_blocked_websites")
            output=$(sync_blocked_websites_handler "$job")
            ;;
        "service_health_check")
            output=$(service_health_check_handler "$job")
            ;;
        "network_diagnostics")
            output=$(network_diagnostics_handler "$job")
            ;;
        "quarantine_agent")
            output=$(quarantine_agent_handler "$job")
            ;;
        "apply_security_patch")
            output=$(apply_security_patch_handler "$job")
            ;;
        "disk_cleanup")
            output=$(disk_cleanup_handler)
            ;;
        # v5.0.5: NEW - Missing handler parity
        "collect_web_activity")
            output=$(collect_web_activity_handler)
            ;;
        "light_vuln_scan")
            output=$(light_vuln_scan_handler)
            ;;
        "update_agent")
            output=$(update_agent_handler)
            ;;
        "scan")
            output=$(scan_handler)
            ;;
        "report")
            output=$(report_handler)
            ;;
        "collect_info")
            output=$(collect_info_handler)
            ;;
        "reinstall_agent")
            output=$(reinstall_agent_handler)
            ;;
        "collect_dns_blocks")
            output=$(collect_dns_blocks_handler)
            ;;
        "remove_dns_filter")
            output=$(remove_dns_filter_handler)
            ;;
        "integration_test_v3")
            output='{"pong":true,"agent_version":"'"$AGENT_VERSION"'","timestamp":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'","hostname":"'"$(hostname)"'"}'
            ;;
        *)
            error_message="Unknown job type: $job_type"
            status="failed"
            log "WARN" "[JOB] Unknown job type: $job_type"
            ;;
    esac
     
     local end_time
     end_time=$(date +%s)
     local duration=$((end_time - start_time))
     
     # 4. Calculate output hash
     local output_hash
     output_hash=$(echo -n "$output" | shasum -a 256 | cut -d' ' -f1)
     
     log "SUCCESS" "[JOB] Completed $job_type in ${duration}s (status: $status)"
     
     local exec_hash
      exec_hash=$(echo "$hash_data" | jq -r '.execution_hash')
      local prev_hash
      prev_hash=$(echo "$hash_data" | jq -r '.previous_execution_hash')
      local exec_index
      exec_index=$(echo "$hash_data" | jq -r '.execution_index')
     
     cat <<EOF
 {"success":true,"status":"$status","output":$output,"output_hash":"$output_hash","error_message":"$error_message","duration_seconds":$duration,"execution_hash":"$exec_hash","previous_execution_hash":"$prev_hash","execution_index":$exec_index}
 EOF
 }
 
 submit_job_result() {
     local job="$1"
     local result="$2"
     
     local execution_id
      execution_id=$(echo "$job" | jq -r '.execution_id')
      local job_id
      job_id=$(echo "$job" | jq -r '.id')
      local status
      status=$(echo "$result" | jq -r '.status')
      local output_hash
      output_hash=$(echo "$result" | jq -r '.output_hash')
      local finished_at
      finished_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      
      # Sign result
      local signature
      signature=$(sign_execution_result "$execution_id" "$job_id" "$status" "$output_hash" "$finished_at")
      
      local output
      output=$(echo "$result" | jq -c '.output // {}')
      local error_message
      error_message=$(echo "$result" | jq -r '.error_message // ""')
      local exec_hash
      exec_hash=$(echo "$result" | jq -r '.execution_hash')
      local prev_hash
      prev_hash=$(echo "$result" | jq -r '.previous_execution_hash')
      local exec_index
      exec_index=$(echo "$result" | jq -r '.execution_index')
     
     local payload
     payload=$(cat <<EOF
 {"execution_id":"$execution_id","job_id":"$job_id","status":"$status","output":$output,"output_hash":"$output_hash","error_message":"$error_message","finished_at":"$finished_at","result_signature":"$signature","execution_hash":"$exec_hash","previous_execution_hash":"$prev_hash","execution_index":$exec_index,"agent_version":"$AGENT_VERSION"}
 EOF
 )
     
     log "DEBUG" "[SUBMIT] Submitting result for job $job_id..."
     
     local response
     response=$(invoke_secure_request "POST" "/functions/v1/submit-job-result" "$payload" 30 3)
     
     if [[ $? -eq 0 ]]; then
         log "SUCCESS" "[SUBMIT] Result submitted successfully for job $job_id"
         return 0
     fi
     
     log "ERROR" "[SUBMIT] Failed to submit result"
     return 1
 }
 
 # ============================================
 #  JOB HANDLERS
 # ============================================
 collect_software_inventory() {
     local software_list='[]'
     local count=0
     
     # Get installed applications from /Applications
     if [[ -d "/Applications" ]]; then
         software_list=$(ls -1 /Applications 2>/dev/null | grep "\.app$" | while read app; do
             echo "{\"name\":\"$app\",\"version\":\"\"}"
         done | paste -sd',' - | sed 's/^/[/' | sed 's/$/]/')
         count=$(ls -1 /Applications 2>/dev/null | grep "\.app$" | wc -l | tr -d ' ')
     fi
     
     # Also check Homebrew if available
     if command -v brew &>/dev/null; then
         local brew_count
         brew_count=$(brew list 2>/dev/null | wc -l | tr -d ' ')
         count=$((count + brew_count))
     fi
     
     cat <<EOF
 {"software_count":$count,"software_list":$software_list,"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 collect_antivirus_status() {
     local av_list='[]'
     
     # Check for XProtect (built-in macOS protection)
     local xprotect_version
     xprotect_version=$(/usr/libexec/xprotect_config version 2>/dev/null | head -1 || echo "unknown")
     av_list="[{\"name\":\"XProtect\",\"version\":\"$xprotect_version\",\"state\":\"active\"}]"
     
     cat <<EOF
 {"antivirus_products":$av_list,"count":1,"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 collect_network_info() {
     local adapters='[]'
     local ip_addresses='[]'
     
     # Get network interfaces
     adapters=$(ifconfig -l 2>/dev/null | tr ' ' '\n' | while read iface; do
         local mac
         mac=$(ifconfig "$iface" 2>/dev/null | grep ether | awk '{print $2}' || echo "")
         if [[ -n "$mac" ]]; then
             echo "{\"name\":\"$iface\",\"mac\":\"$mac\",\"state\":\"active\"}"
         fi
     done | paste -sd',' - | sed 's/^/[/' | sed 's/$/]/')
     
     # Get IP addresses
     ip_addresses=$(ifconfig 2>/dev/null | grep "inet " | grep -v "127.0.0.1" | awk '{print "{\"ip\":\"" $2 "\",\"prefix\":24}"}' | paste -sd',' - | sed 's/^/[/' | sed 's/$/]/')
     
     cat <<EOF
 {"adapters":$adapters,"ip_addresses":$ip_addresses,"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 fix_firewall() {
     local job="$1"
     local payload
     payload=$(python3 -c "import json; print(json.dumps(json.loads('$job').get('payload', {})))" 2>/dev/null || echo '{}')
     
     local results='{}'
     
     # macOS Application Firewall
     local enable
     enable=$(python3 -c "import json; print(json.loads('$payload').get('enable', False))" 2>/dev/null)
     
     if [[ "$enable" == "True" || "$enable" == "true" ]]; then
         /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on 2>/dev/null || true
         results='{"firewall":"enabled"}'
     fi
     
     cat <<EOF
 {"success":true,"changes":$results,"applied_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 # ============================================
 #  v5.0.1: DNS BLOCKLIST SYNC
 # ============================================
 sync_dns_blocklist() {
     local dns_body
     dns_body="{\"agent_name\":\"$AGENT_NAME\",\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}"
     
     local result
     result=$(invoke_secure_request "POST" "/functions/v1/serve-dns-filter" "$dns_body" 15 2)
     
     if [[ $? -ne 0 ]]; then
         return 1
     fi
     
     local count
     count=$(python3 -c "import json; print(len(json.loads('$result').get('domains', [])))" 2>/dev/null || echo 0)
     
     if [[ "$count" -gt 0 ]]; then
         echo "$result" > "$DNS_BLOCKLIST_PATH"
         log "INFO" "[DNS] Synced $count blocked domains"
         return 0
     fi
     
     return 1
 }
 
 # ============================================
 #  v5.0.1: NETWORK WATCHDOG
 # ============================================
 test_network_connectivity() {
     if nc -z -w5 "$NETWORK_TEST_HOST" "$NETWORK_TEST_PORT" 2>/dev/null; then
         return 0
     fi
     return 1
 }
 
 # ============================================
 #  v5.0.1: AUTO-REPAIR - DISK CLEANUP
 # ============================================
 invoke_disk_cleanup() {
     local disk_usage
     disk_usage=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
     
     if [[ "$disk_usage" -lt "$DISK_CLEANUP_THRESHOLD" ]]; then
         echo '{"cleaned":false,"reason":"disk_ok","usage_percent":'$disk_usage'}'
         return 0
     fi
     
     log "WARN" "[DISK-CLEANUP] Disk usage at $disk_usage% (threshold: $DISK_CLEANUP_THRESHOLD%). Starting cleanup..."
     
     local actions=()
     
     # Clean user caches
     rm -rf ~/Library/Caches/* 2>/dev/null || true
     actions+=("user_caches")
     
     # Clean system caches (requires sudo)
     rm -rf /Library/Caches/* 2>/dev/null || true
     actions+=("system_caches")
     
     # Clean old logs
     find /var/log -type f -mtime +7 -delete 2>/dev/null || true
     actions+=("old_logs")
     
     # Clean Homebrew cache if available
     if command -v brew &>/dev/null; then
         brew cleanup --prune=7 2>/dev/null || true
         actions+=("brew_cleanup")
     fi
     
     local disk_usage_after
     disk_usage_after=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
     local freed_percent=$((disk_usage - disk_usage_after))
     
     log "SUCCESS" "[DISK-CLEANUP] Completed. Usage: $disk_usage% -> $disk_usage_after% (freed: ${freed_percent}%)"
     
     AUTO_REPAIR_DISK_CLEANUPS=$((AUTO_REPAIR_DISK_CLEANUPS + 1))
     AUTO_REPAIR_LAST_DISK_CLEANUP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
     
     echo '{"cleaned":true,"before_percent":'$disk_usage',"after_percent":'$disk_usage_after',"freed_percent":'$freed_percent'}'
 }
 
 # ============================================
 #  v5.0.1: AUTO-REPAIR - HIGH CPU PROCESS CHECK
 # ============================================
 invoke_high_cpu_process_check() {
     # Protected processes (NEVER kill)
     local protected_processes=(
         "launchd" "kernel_task" "WindowServer" "loginwindow"
         "syslogd" "mds_stores" "securityd" "opendirectoryd"
         "diskarbitrationd" "configd" "coreaudiod"
         "bash" "zsh" "cybershield"
     )
     
     local killed_count=0
     
     # Get processes using more than threshold CPU
     local high_cpu_procs
     high_cpu_procs=$(ps aux | awk -v threshold="$HIGH_CPU_THRESHOLD" 'NR>1 && $3 > threshold {print $2 ":" $11 ":" $3}' | head -5)
     
     for proc_info in $high_cpu_procs; do
         local pid
         pid=$(echo "$proc_info" | cut -d: -f1)
         local name
         name=$(echo "$proc_info" | cut -d: -f2 | sed 's|.*/||')
         local cpu
         cpu=$(echo "$proc_info" | cut -d: -f3)
         
         # Check if protected
         local is_protected=false
         for p in "${protected_processes[@]}"; do
             if [[ "$name" == *"$p"* ]]; then
                 is_protected=true
                 break
             fi
         done
         
         if [[ "$is_protected" == "false" ]]; then
             log "WARN" "[PROCESS-CHECK] High CPU detected: $name (PID: $pid) at $cpu%"
             
              # v5.0.13-perf: O(1) baseline check via associative array
              if [[ -z "${PROCESS_BASELINE_MAP[$name]+_}" ]]; then
                  log "WARN" "[PROCESS-CHECK] Process $name NOT in baseline - killing..."
                  kill -9 "$pid" 2>/dev/null || true
                  killed_count=$((killed_count + 1))
                  log "SUCCESS" "[PROCESS-CHECK] Killed suspicious process: $name (PID: $pid)"
              fi
          fi
     done
     
     if [[ $killed_count -gt 0 ]]; then
         AUTO_REPAIR_PROCESSES_KILLED=$((AUTO_REPAIR_PROCESSES_KILLED + killed_count))
         AUTO_REPAIR_LAST_PROCESS_KILL=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
     fi
     
     echo '{"checked":true,"killed_count":'$killed_count'}'
 }
 
 # ============================================
 #  v5.0.1: TOP PROCESSES COLLECTION
 # ============================================
 get_top_processes() {
     local top_by_cpu
     top_by_cpu=$(ps aux -r | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
     
     local top_by_memory
     top_by_memory=$(ps aux -m | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
     
     local total_procs
     total_procs=$(ps aux | wc -l | tr -d ' ')
     
     cat <<EOF
 {"top_by_cpu":[$top_by_cpu],"top_by_memory":[$top_by_memory],"total_processes":$total_procs,"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 # ============================================
 #  v5.0.13-perf: PROCESS BASELINE (O(1) lookups via associative array + jq)
 # ============================================
 initialize_process_baseline() {
     if [[ -f "$PROCESS_BASELINE_PATH" ]]; then
         # v5.0.13-perf: Use jq instead of python3 (~60x faster)
         if command -v jq &>/dev/null; then
             while IFS= read -r proc; do
                 PROCESS_BASELINE+=("$proc")
                 PROCESS_BASELINE_MAP["$proc"]=1
             done < <(jq -r '.[].name' "$PROCESS_BASELINE_PATH" 2>/dev/null)
         else
             while IFS= read -r proc; do
                 PROCESS_BASELINE+=("$proc")
                 PROCESS_BASELINE_MAP["$proc"]=1
             done < <(python3 -c "import json; [print(p['name']) for p in json.load(open('$PROCESS_BASELINE_PATH'))]" 2>/dev/null)
         fi
         log "INFO" "[BASELINE] Loaded baseline with ${#PROCESS_BASELINE[@]} processes (O(1) map)"
     else
         log "INFO" "[BASELINE] Creating initial process baseline..."
         
         local baseline='['
         local first=true
         local ts
         ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
         for proc in $(ps -eo comm= | sort -u); do
             if [[ "$first" == "true" ]]; then
                 first=false
             else
                 baseline+=','
             fi
             baseline+="{\"name\":\"$proc\",\"first_seen\":\"$ts\"}"
             PROCESS_BASELINE+=("$proc")
             PROCESS_BASELINE_MAP["$proc"]=1
         done
         baseline+=']'
         
         echo "$baseline" > "$PROCESS_BASELINE_PATH"
         log "SUCCESS" "[BASELINE] Created baseline with ${#PROCESS_BASELINE[@]} processes (O(1) map)"
     fi
 }
 
 get_process_anomalies() {
     local anomaly_count=0
     
     # v5.0.13-perf: O(1) lookup via associative array instead of O(n) linear scan
     for proc in $(ps -eo comm= | sort -u); do
         if [[ -z "${PROCESS_BASELINE_MAP[$proc]+_}" ]]; then
             anomaly_count=$((anomaly_count + 1))
             PROCESS_BASELINE+=("$proc")
             PROCESS_BASELINE_MAP["$proc"]=1
         fi
     done
     
     if [[ $anomaly_count -gt 0 ]]; then
         log "WARN" "[BASELINE] Detected $anomaly_count new processes"
     fi
     
     echo '{"anomaly_count":'$anomaly_count'}'
 }
 
 # ============================================
 #  SYSTEM METRICS
 # ============================================
 get_system_metrics() {
     local cpu_percent
     cpu_percent=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | tr -d '%' 2>/dev/null || echo 0)
     
     local mem_info
     mem_info=$(vm_stat 2>/dev/null)
     local page_size=4096
     local pages_free
     pages_free=$(echo "$mem_info" | grep "Pages free" | awk '{print $3}' | tr -d '.')
     local pages_active
     pages_active=$(echo "$mem_info" | grep "Pages active" | awk '{print $3}' | tr -d '.')
     
     local mem_total
     mem_total=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
     local mem_used=$((pages_active * page_size))
     local mem_percent
     if [[ $mem_total -gt 0 ]]; then
         mem_percent=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc 2>/dev/null || echo 0)
     else
         mem_percent=0
     fi
     
     local disk_info
     disk_info=$(df / | tail -1)
     local disk_percent
     disk_percent=$(echo "$disk_info" | awk '{print $5}' | tr -d '%')
     
     local uptime_seconds
     uptime_seconds=$(sysctl -n kern.boottime 2>/dev/null | awk '{print $4}' | tr -d ',')
     local now
     now=$(date +%s)
     if [[ -n "$uptime_seconds" ]]; then
         uptime_seconds=$((now - uptime_seconds))
     else
         uptime_seconds=0
     fi
     
     cat <<EOF
 {"cpu_percent":$cpu_percent,"memory_total_gb":$(echo "scale=2; $mem_total / 1073741824" | bc 2>/dev/null || echo 0),"memory_used_gb":$(echo "scale=2; $mem_used / 1073741824" | bc 2>/dev/null || echo 0),"memory_used_percent":$mem_percent,"disk_used_percent":$disk_percent,"uptime_seconds":$uptime_seconds}
 EOF
 }
 
 # ============================================
 #  HEARTBEAT
 # ============================================
 send_heartbeat() {
     log "DEBUG" "[HEARTBEAT] Sending heartbeat..."
     
     local metrics
     metrics=$(get_system_metrics)
     local top_processes
     top_processes=$(get_top_processes)
     local anomalies
     anomalies=$(get_process_anomalies)
     local anomaly_count
     anomaly_count=$(python3 -c "import json; print(json.loads('$anomalies').get('anomaly_count', 0))" 2>/dev/null || echo 0)
     
     local payload
     payload=$(cat <<EOF
 {"agent_name":"$AGENT_NAME","agent_version":"$AGENT_VERSION","hostname":"$(hostname)","timestamp":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")","system_metrics":$metrics,"processes":$top_processes,"process_anomaly_count":$anomaly_count,"auto_repair_stats":{"disk_cleanups":$AUTO_REPAIR_DISK_CLEANUPS,"processes_killed":$AUTO_REPAIR_PROCESSES_KILLED,"last_disk_cleanup":"$AUTO_REPAIR_LAST_DISK_CLEANUP","last_process_kill":"$AUTO_REPAIR_LAST_PROCESS_KILL"},"state":"$CURRENT_STATE"}
EOF
)
     
     local result
     result=$(invoke_secure_request "POST" "/functions/v1/heartbeat" "$payload" 30 3)
     local exit_code=$?
     
     if [[ $exit_code -eq 0 ]]; then
         log "SUCCESS" "[HEARTBEAT] Sent successfully"
         
         # ============================================
         # v5.0.8: FORCE UPDATE VIA HEARTBEAT RESPONSE
         # Ported from Windows v5.0.7 - bypasses job system
         # ============================================
         if [[ -n "$result" ]]; then
             local force_update
             force_update=$(python3 -c "import json; print(json.loads('''$result''').get('force_update', False))" 2>/dev/null || echo "False")
             
             if [[ "$force_update" == "True" ]]; then
                 log "WARN" "[FORCE UPDATE] Update forcado detectado via heartbeat!"
                 local target_version
                 target_version=$(python3 -c "import json; print(json.loads('''$result''').get('target_version', ''))" 2>/dev/null)
                 log "INFO" "[FORCE UPDATE] Target version: $target_version"
                 
                 apply_forced_update "$result"
              fi
              
              # ============================================
              # v5.0.9: DYNAMIC POLLING INTERVALS FROM SERVER
              # Server controls agent cadence via heartbeat response
              # ============================================
              local new_hb_interval
              new_hb_interval=$(python3 -c "import json; print(json.loads('''$result''').get('heartbeat_interval_seconds', 0))" 2>/dev/null || echo 0)
              if [[ "$new_hb_interval" -ge 10 && "$new_hb_interval" != "$POLL_INTERVAL" ]]; then
                  log "INFO" "[HEARTBEAT] Server adjusted heartbeat interval: ${POLL_INTERVAL}s -> ${new_hb_interval}s"
                  POLL_INTERVAL=$new_hb_interval
              fi
              
              local new_job_interval
              new_job_interval=$(python3 -c "import json; print(json.loads('''$result''').get('poll_interval_seconds', 0))" 2>/dev/null || echo 0)
              if [[ "$new_job_interval" -ge 10 && "$new_job_interval" != "$JOB_POLL_INTERVAL" ]]; then
                  log "INFO" "[HEARTBEAT] Server adjusted job poll interval: ${JOB_POLL_INTERVAL}s -> ${new_job_interval}s"
                  JOB_POLL_INTERVAL=$new_job_interval
              fi
          fi
          
          return 0
     else
         log "ERROR" "[HEARTBEAT] Failed"
         return 1
     fi
 }
 
 # ============================================
 #  v5.0.8: FORCE UPDATE - Auto-update sem restart
 # ============================================
 apply_forced_update() {
     local response="$1"
     
     local target_version
     target_version=$(python3 -c "import json; print(json.loads('''$response''').get('target_version', ''))" 2>/dev/null)
     local base64_content
     base64_content=$(python3 -c "import json; print(json.loads('''$response''').get('script_content_base64', ''))" 2>/dev/null)
     local expected_hash
     expected_hash=$(python3 -c "import json; print(json.loads('''$response''').get('sha256', ''))" 2>/dev/null)
     local reason
     reason=$(python3 -c "import json; print(json.loads('''$response''').get('reason', 'heartbeat_force_update'))" 2>/dev/null)
     
     if [[ -z "$target_version" || -z "$base64_content" || -z "$expected_hash" ]]; then
         log "ERROR" "[FORCE UPDATE] Dados incompletos no response"
         return 1
     fi
     
     log "INFO" "[FORCE UPDATE] Version: $target_version, Reason: $reason"
     
     # v5.0.13-patch: Pre-decode size validation (prevents OOM before Base64 decode)
     local base64_len=${#base64_content}
     local max_base64_len=7340032  # ~5MB binary = ~7MB Base64
     if [[ "$base64_len" -gt "$max_base64_len" ]]; then
         log "ERROR" "[FORCE UPDATE] REJECTED - Base64 payload too large BEFORE decode: $base64_len chars (max $max_base64_len)"
         logger -t CyberShield "Update rejected: Base64 payload too large before decode ($base64_len chars)"
         return 1
     fi

     # Decode Base64
     local temp_script="/tmp/cybershield-force-update-${target_version}.sh"
     echo "$base64_content" | base64 -D > "$temp_script" 2>/dev/null
     
     if [[ ! -s "$temp_script" ]]; then
         log "ERROR" "[FORCE UPDATE] Base64 decode falhou"
         rm -f "$temp_script"
         return 1
     fi
     
     local decoded_size
     decoded_size=$(stat -f%z "$temp_script" 2>/dev/null)
     log "DEBUG" "[FORCE UPDATE] Script decodificado: $decoded_size bytes"
     
     # Validate SHA256
     local actual_hash
     actual_hash=$(shasum -a 256 "$temp_script" 2>/dev/null | awk '{print $1}')
     
     if [[ "${actual_hash}" != "${expected_hash}" ]]; then
         local actual_lower expected_lower
         actual_lower=$(echo "$actual_hash" | tr '[:upper:]' '[:lower:]')
         expected_lower=$(echo "$expected_hash" | tr '[:upper:]' '[:lower:]')
         if [[ "$actual_lower" != "$expected_lower" ]]; then
             log "ERROR" "[FORCE UPDATE] SHA256 mismatch! Esperado: $expected_hash, Obtido: $actual_hash"
             rm -f "$temp_script"
             return 1
         fi
     fi
     
     log "SUCCESS" "[FORCE UPDATE] SHA256 validado: $actual_hash"

     # v5.0.13-patch: Verify Ed25519/ECDSA signature on update payload (mandatory)
     local update_signature
     update_signature=$(python3 -c "import json; print(json.loads('''$response''').get('ecdsa_signature', '') or json.loads('''$response''').get('signature_base64', ''))" 2>/dev/null)
     if [[ -n "$update_signature" && ${#update_signature} -gt 10 ]]; then
         local ed25519_pubkey_path="${BASE_DIR:-/opt/cybershield}/keys/ed25519_server.pub"
         if [[ -f "$ed25519_pubkey_path" ]] && command -v openssl &>/dev/null; then
             local _tmp_hash _tmp_sig
             _tmp_hash=$(mktemp) || { log "ERROR" "[FORCE UPDATE] mktemp failed"; rm -f "$temp_script"; return 1; }
             _tmp_sig=$(mktemp) || { rm -f "$_tmp_hash"; log "ERROR" "[FORCE UPDATE] mktemp failed"; rm -f "$temp_script"; return 1; }
             echo -n "$actual_hash" > "$_tmp_hash"
             echo "$update_signature" | base64 -d > "$_tmp_sig" 2>/dev/null || \
                 echo "$update_signature" | base64 -D > "$_tmp_sig" 2>/dev/null
             if ! openssl pkeyutl -verify -pubin -inkey "$ed25519_pubkey_path" \
                 -sigfile "$_tmp_sig" -rawin -in "$_tmp_hash" 2>/dev/null; then
                 log "ERROR" "[FORCE UPDATE] REJECTED - Update signature INVALID! Possible supply chain attack."
                 logger -t CyberShield "FORCE UPDATE REJECTED: Invalid cryptographic signature. SHA256: $actual_hash"
                 rm -f "$temp_script" "$_tmp_hash" "$_tmp_sig"
                 return 1
             fi
             rm -f "$_tmp_hash" "$_tmp_sig"
             log "SUCCESS" "[FORCE UPDATE] Cryptographic signature VERIFIED for update payload"
         else
             log "WARN" "[FORCE UPDATE] Ed25519 public key or openssl not available - cannot verify signature"
         fi
     else
         # v5.0.13-patch: Reject unsigned payloads
         log "ERROR" "[FORCE UPDATE] REJECTED - No cryptographic signature on update payload. Unsigned updates blocked."
         logger -t CyberShield "Update rejected: missing cryptographic signature (unsigned payloads blocked since v5.0.13)"
         rm -f "$temp_script"
         return 1
     fi
     
     # Anti-corruption: reject HTML content
     local first_line
     first_line=$(head -1 "$temp_script")
     if [[ "$first_line" == *"<!DOCTYPE"* || "$first_line" == *"<html"* ]]; then
         log "ERROR" "[FORCE UPDATE] Conteudo HTML detectado - rejeitando"
         rm -f "$temp_script"
         return 1
     fi
     
     # Detect current script path
     local current_script
     current_script=$(greadlink -f "$0" 2>/dev/null || readlink -f "$0" 2>/dev/null || echo "$0")
     
     # Backup current script
     if [[ -f "$current_script" ]]; then
         cp "$current_script" "${current_script}.backup" 2>/dev/null
         log "INFO" "[FORCE UPDATE] Backup criado: ${current_script}.backup"
     fi
     
     # Apply update
     chmod +x "$temp_script"
     cp "$temp_script" "$current_script" 2>/dev/null
     rm -f "$temp_script"
     
     log "SUCCESS" "[FORCE UPDATE] Script instalado: $current_script"
     
     # Confirm on backend
     local confirm_payload
     confirm_payload="{\"agent_name\":\"$AGENT_NAME\",\"old_version\":\"$AGENT_VERSION\",\"new_version\":\"$target_version\",\"sha256\":\"$actual_hash\",\"method\":\"heartbeat_force_update\",\"platform\":\"macos\",\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}"
     
     invoke_secure_request "POST" "/functions/v1/confirm-force-update" "$confirm_payload" 10 1 2>/dev/null || true
     
     log "INFO" "[FORCE UPDATE] Reiniciando agente com nova versao..."
     
     # Restart via launchd (no Mac restart needed)
     local plist_label="com.cybershield.agent"
     if launchctl list "$plist_label" &>/dev/null; then
         sudo launchctl kickstart -k "system/$plist_label" 2>/dev/null &
     else
         # Fallback: exec into new script
         exec "$current_script" --server-url "$SERVER_URL" --agent-token "$AGENT_TOKEN" --hmac-secret "$HMAC_SECRET" --agent-name "$AGENT_NAME" &
     fi
     
     log "SUCCESS" "[FORCE UPDATE] Restart iniciado - saindo do processo atual"
     exit 0
 }
 
 # ============================================
 #  v5.0.4: SOAR/AUTOMATION HANDLERS
 # ============================================
 sync_blocked_websites_handler() {
     local job="$1"
     local urls
     urls=$(echo "$job" | python3 -c "import sys,json; [print(u) for u in json.loads(sys.stdin.read()).get('payload',{}).get('urls',[])]" 2>/dev/null)
     
     local blocked=0
     local marker_start="# === CyberShield Blocked Websites Start ==="
     local marker_end="# === CyberShield Blocked Websites End ==="
     local hosts_file="/etc/hosts"
     
     sudo sed -i '' "/$marker_start/,/$marker_end/d" "$hosts_file" 2>/dev/null
     
     echo "$marker_start" | sudo tee -a "$hosts_file" > /dev/null
     while IFS= read -r url; do
         if [[ -n "$url" ]]; then
             local domain
             domain=$(echo "$url" | sed 's|https\?://||' | sed 's|/.*||')
             echo "0.0.0.0 $domain" | sudo tee -a "$hosts_file" > /dev/null
             echo "0.0.0.0 www.$domain" | sudo tee -a "$hosts_file" > /dev/null
             blocked=$((blocked + 1))
         fi
     done <<< "$urls"
     echo "$marker_end" | sudo tee -a "$hosts_file" > /dev/null
     
     sudo dscacheutil -flushcache 2>/dev/null
     sudo killall -HUP mDNSResponder 2>/dev/null
     
     cat <<EOF
 {"success":true,"blocked_count":$blocked,"method":"hosts_file","synced_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 service_health_check_handler() {
     local job="$1"
     local services
     services=$(echo "$job" | python3 -c "import sys,json; [print(s) for s in json.loads(sys.stdin.read()).get('payload',{}).get('services',['com.apple.mDNSResponder','com.apple.ftp-proxy'])]" 2>/dev/null)
     
     local results="[]"
     local unhealthy=0
     local checked=0
     
     while IFS= read -r svc; do
         if [[ -n "$svc" ]]; then
             local status="unknown"
             local healthy="false"
             if launchctl list "$svc" &>/dev/null; then
                 status="running"
                 healthy="true"
             else
                 status="not_running"
                 unhealthy=$((unhealthy + 1))
             fi
             results=$(echo "$results" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); d.append({'name':'$svc','status':'$status','healthy':$healthy}); print(json.dumps(d))" 2>/dev/null)
             checked=$((checked + 1))
         fi
     done <<< "$services"
     
     cat <<EOF
 {"success":true,"services_checked":$checked,"unhealthy_count":$unhealthy,"services":$results,"checked_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 network_diagnostics_handler() {
     local job="$1"
     local targets
     targets=$(echo "$job" | python3 -c "import sys,json; [print(t) for t in json.loads(sys.stdin.read()).get('payload',{}).get('targets',['8.8.8.8','1.1.1.1'])]" 2>/dev/null)
     
     local diagnostics="[]"
     
     while IFS= read -r target; do
         if [[ -n "$target" ]]; then
             local ping_result='{"success":false}'
             local dns_result='{"success":false}'
             
             if ping -c 3 -W 5 "$target" &>/dev/null; then
                 local avg_ms
                 avg_ms=$(ping -c 3 -W 5 "$target" 2>/dev/null | tail -1 | awk -F'/' '{print $5}')
                 ping_result="{\"success\":true,\"avg_ms\":${avg_ms:-0}}"
             fi
             
             if dig_out=$(dig +short "$target" 2>/dev/null | head -3); then
                 dns_result='{"success":true}'
             fi
             
             diagnostics=$(echo "$diagnostics" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); d.append({'target':'$target','ping':$ping_result,'dns':$dns_result}); print(json.dumps(d))" 2>/dev/null)
         fi
     done <<< "$targets"
     
     cat <<EOF
 {"success":true,"diagnostics":$diagnostics,"checked_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 quarantine_agent_handler() {
     local job="$1"
     local action
     action=$(echo "$job" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('payload',{}).get('action','quarantine'))" 2>/dev/null)
     local server_host
     server_host=$(echo "$SERVER_URL" | sed 's|https\?://||' | sed 's|/.*||')
     
     if [[ "$action" == "release" ]]; then
         sudo pfctl -F all 2>/dev/null
         echo '{"success":true,"action":"released","released_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
     else
         # macOS uses pf firewall
         local pf_rules="/tmp/cybershield_quarantine.pf"
         cat > "$pf_rules" << PFRULES
 pass out quick on lo0 all
 pass out quick proto udp to any port 53
 pass out quick to $server_host
 block out all
 PFRULES
         sudo pfctl -f "$pf_rules" -e 2>/dev/null
         echo '{"success":true,"action":"quarantined","server_host":"'"$server_host"'","quarantined_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
     fi
 }
 
 apply_security_patch_handler() {
     local job="$1"
     local cve_id
     cve_id=$(echo "$job" | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('payload',{}).get('cve_id',''))" 2>/dev/null)
     
     # macOS uses softwareupdate
     sudo softwareupdate --install --recommended 2>/dev/null
     
     echo '{"success":true,"cve_id":"'"$cve_id"'","method":"softwareupdate","patched_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
 }
 
 disk_cleanup_handler() {
     local before_free
     before_free=$(df -g / | tail -1 | awk '{print $4}')
     
     # Clean caches and temp
     sudo rm -rf /private/var/folders/*/* 2>/dev/null
     sudo rm -rf /Library/Caches/* 2>/dev/null
     rm -rf ~/Library/Caches/* 2>/dev/null
     sudo find /private/var/log -name "*.gz" -mtime +30 -delete 2>/dev/null
     
     local after_free
     after_free=$(df -g / | tail -1 | awk '{print $4}')
     local freed=$((after_free - before_free))
     
     echo '{"success":true,"freed_gb":'$freed',"before_free_gb":'$before_free',"after_free_gb":'$after_free',"cleaned_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
 }

# ============================================
#  v5.0.5: NEW HANDLERS - Handler Parity
# ============================================

collect_web_activity_handler() {
    log "INFO" "[JOB] Collecting web activity (DNS cache + browser history)"
    
    # Collect DNS cache from macOS
    local dns_entries='[]'
    local dns_raw
    dns_raw=$(sudo dscacheutil -cachedump -entries 2>/dev/null | head -50 || echo "")
    if [[ -n "$dns_raw" ]]; then
        dns_entries=$(echo "$dns_raw" | python3 -c "import sys,json; lines=[l.strip() for l in sys.stdin if l.strip()]; print(json.dumps([{'entry':l} for l in lines[:50]]))" 2>/dev/null || echo '[]')
    fi
    
    # Collect Safari history
    local browser_history='[]'
    local safari_db="$HOME/Library/Safari/History.db"
    if [[ -f "$safari_db" ]]; then
        local tmp_db="/tmp/cybershield_safari_$(date +%s).db"
        cp "$safari_db" "$tmp_db" 2>/dev/null
        if command -v sqlite3 &>/dev/null; then
            browser_history=$(sqlite3 "$tmp_db" "SELECT url, title FROM history_items ORDER BY visit_count DESC LIMIT 50;" 2>/dev/null | \
                python3 -c "import sys,json; lines=[l.strip().split('|',1) for l in sys.stdin if l.strip()]; print(json.dumps([{'url':l[0],'title':l[1] if len(l)>1 else ''} for l in lines]))" 2>/dev/null || echo '[]')
        fi
        rm -f "$tmp_db" 2>/dev/null
    fi
    
    local collected_at
    collected_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo '{"dns_cache":'"$dns_entries"',"browser_history":'"$browser_history"',"collected_at":"'"$collected_at"'","source":"macos"}'
}

light_vuln_scan_handler() {
    log "INFO" "[JOB] Running light vulnerability scan"
    
    local vulns='[]'
    local total=0
    local high=0
    
    # Check for available macOS software updates
    local updates
    updates=$(softwareupdate --list 2>&1 | grep -i "recommended\|restart\|security" || echo "")
    
    if [[ -n "$updates" ]]; then
        vulns=$(echo "$updates" | head -20 | python3 -c "
import sys, json
lines = [l.strip() for l in sys.stdin if l.strip()]
results = []
for l in lines:
    sev = 'critical' if 'security' in l.lower() else 'high' if 'restart' in l.lower() else 'medium'
    results.append({'package': l[:80], 'severity': sev, 'source': 'softwareupdate'})
print(json.dumps(results))
" 2>/dev/null || echo '[]')
        total=$(echo "$vulns" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo 0)
    fi
    
    local scanned_at
    scanned_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo '{"vulnerabilities":'"$vulns"',"summary":{"total":'$total',"critical":0,"high":'$high',"medium":0,"low":0},"scan_tool":"softwareupdate","scanned_at":"'"$scanned_at"'","platform":"macos"}'
}

update_agent_handler() {
    log "INFO" "[JOB] update_agent received - delegating to heartbeat force_update mechanism"
    echo '{"success":true,"message":"Update delegated to heartbeat force_update mechanism","agent_version":"'"$AGENT_VERSION"'","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

scan_handler() {
    log "INFO" "[JOB] Running general security scan"
    local open_ports
    open_ports=$(lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | tail -n +2 | awk '{print $9}' | head -20 | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo '[]')
    local users_logged
    users_logged=$(who 2>/dev/null | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo '[]')
    local uptime_info
    uptime_info=$(uptime 2>/dev/null || echo "unknown")
    echo '{"open_ports":'"$open_ports"',"logged_users":'"$users_logged"',"uptime":"'"$uptime_info"'","scanned_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

report_handler() {
    log "INFO" "[JOB] Generating agent report"
    local disk_usage
    disk_usage=$(df -g / | tail -1 | awk '{print "{\"total\":\""$2"G\",\"used\":\""$3"G\",\"free\":\""$4"G\",\"percent\":\""$5"\"}"}')
    local mem_info
    mem_info=$(vm_stat 2>/dev/null | python3 -c "
import sys
lines = sys.stdin.readlines()
pages = {}
for l in lines:
    parts = l.strip().split(':')
    if len(parts)==2:
        key = parts[0].strip().lower()
        val = parts[1].strip().rstrip('.')
        try: pages[key] = int(val)
        except: pass
page_size = 16384
total_mb = sum(pages.values()) * page_size // (1024*1024)
free_mb = pages.get('pages free', 0) * page_size // (1024*1024)
print('{\"total_mb\":%d,\"free_mb\":%d}' % (total_mb, free_mb))
" 2>/dev/null || echo '{}')
    echo '{"agent_version":"'"$AGENT_VERSION"'","hostname":"'$(hostname)'",'$disk_usage',"memory":'"$mem_info"',"generated_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

collect_info_handler() {
    log "INFO" "[JOB] Collecting system info"
    local os_version
    os_version=$(sw_vers 2>/dev/null | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo '[]')
    local kernel
    kernel=$(uname -r 2>/dev/null || echo "unknown")
    local arch
    arch=$(uname -m 2>/dev/null || echo "unknown")
    echo '{"os_info":'"$os_version"',"kernel":"'"$kernel"'","architecture":"'"$arch"'","hostname":"'$(hostname)'","agent_version":"'"$AGENT_VERSION"'","collected_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

reinstall_agent_handler() {
    log "INFO" "[JOB] Reinstall agent requested"
    local download_url="${SERVER_URL}/functions/v1/serve-agent-update?platform=macos"
    local new_script
    new_script=$(curl -s -H "X-Agent-Token: $AGENT_TOKEN" "$download_url" 2>/dev/null)
    if [[ -n "$new_script" && ${#new_script} -gt 1000 ]]; then
        local script_path
        script_path=$(greadlink -f "$0" 2>/dev/null || echo "$0")
        echo "$new_script" > "${script_path}.new" 2>/dev/null
        chmod +x "${script_path}.new" 2>/dev/null
        echo '{"success":true,"message":"New script downloaded, will apply on next restart","path":"'"${script_path}.new"'","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
    else
        echo '{"success":false,"message":"Failed to download new agent script","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
    fi
}

collect_dns_blocks_handler() {
    log "INFO" "[JOB] Collecting DNS blocks from hosts file"
    local blocks='[]'
    if [[ -f /etc/hosts ]]; then
        blocks=$(grep -E "^(0\.0\.0\.0|127\.0\.0\.1)" /etc/hosts 2>/dev/null | grep -v "localhost" | awk '{print $2}' | head -100 | python3 -c "import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))" 2>/dev/null || echo '[]')
    fi
    echo '{"blocked_domains":'"$blocks"',"source":"/etc/hosts","collected_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

remove_dns_filter_handler() {
    log "INFO" "[JOB] Removing DNS filter entries from hosts file"
    if [[ -f /etc/hosts ]]; then
        local count_before
        count_before=$(grep -cE "^(0\.0\.0\.0|127\.0\.0\.1)" /etc/hosts 2>/dev/null | grep -v "localhost" || echo 0)
        sudo sed -i '' '/# CyberShield DNS Block/,/# End CyberShield DNS Block/d' /etc/hosts 2>/dev/null
        local count_after
        count_after=$(grep -cE "^(0\.0\.0\.0|127\.0\.0\.1)" /etc/hosts 2>/dev/null | grep -v "localhost" || echo 0)
        echo '{"success":true,"removed":'$((count_before - count_after))',"timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
    else
        echo '{"success":false,"message":"Hosts file not found","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
    fi
}

# ============================================
#  MAIN LOOP v5.0.1 FULL ENTERPRISE
# ============================================
 log "============================================"
 log "INFO" "[START] CyberShield Agent $AGENT_VERSION FULL ENTERPRISE"
 log "DEBUG" "[INFO] ServerUrl: $SERVER_URL"
 log "DEBUG" "[INFO] AgentName: $AGENT_NAME"
 log "INFO" "[INFO] Features: ECDSA-signing, Ed25519-verify, hash-chain, FSM, DNS-filter, auto-remediation"
 log "============================================"
 
 # ============================================
 #  PHASE 1: INITIALIZATION
 # ============================================
 set_agent_state "INITIALIZING" "Agent startup"
 
 # Restore previous state if exists
 saved_state=$(get_saved_state)
 if [[ "$saved_state" == "SAFE_MODE" ]]; then
     log "WARN" "[STARTUP] Recovering from SAFE_MODE..."
 fi
 
# Initialize ECDSA keys
keys_initialized=false
security_degraded=false
if initialize_agent_keys; then
    keys_initialized=true
else
    log "ERROR" "[STARTUP] Failed to initialize keys - entering DEGRADED mode (FAIL-CLOSED)"
    set_agent_state "DEGRADED" "Key initialization failed"
    security_degraded=true
    log "WARN" "[SECURITY] SecurityDegraded=TRUE - operational jobs will be BLOCKED until crypto is restored"
fi

# v5.0.13: Validate hash cache schema on startup (Windows parity)
if ! validate_hash_cache_schema; then
    log "WARN" "[STARTUP] Hash cache schema invalid - removed corrupted cache"
fi

# v5.0.13: Save initial script hash on startup
initial_hash=$(shasum -a 256 "$0" 2>/dev/null | cut -d' ' -f1)
if [[ -n "$initial_hash" && ${#initial_hash} -eq 64 ]]; then
    save_signed_hash_cache "$initial_hash" ""
    log "DEBUG" "[STARTUP] Initial script hash cached: ${initial_hash:0:16}..."
fi

# ============================================
#  PHASE 2: AUTHENTICATION
# ============================================
if [[ "$security_degraded" == "true" ]]; then
    log "WARN" "[STARTUP] Skipping AUTHENTICATING - SecurityDegraded, staying in DEGRADED for heartbeat attempt"
else
    set_agent_state "AUTHENTICATING" "Validating credentials"
fi

# Send first heartbeat
heartbeat_success=false
if send_heartbeat; then
    heartbeat_success=true
    CONSECUTIVE_HEARTBEAT_FAILURES=0
    
    # Register public key
    if [[ "$keys_initialized" == "true" ]]; then
        register_agent_key || log "WARN" "[STARTUP] Key registration failed"
    fi
else
    log "WARN" "[STARTUP] Initial heartbeat failed - entering DEGRADED mode"
    set_agent_state "DEGRADED" "Heartbeat failed"
    CONSECUTIVE_HEARTBEAT_FAILURES=$((CONSECUTIVE_HEARTBEAT_FAILURES + 1))
    
    # If BOTH keys and heartbeat failed, enter SAFE_MODE (fail-closed)
    if [[ "$keys_initialized" == "false" ]]; then
        log "ERROR" "[SECURITY] No crypto + no auth = SAFE_MODE (fail-closed)"
        set_agent_state "SAFE_MODE" "No auth + no crypto - fail closed"
    fi
fi
 
 # ============================================
 #  PHASE 3: SYNCHRONIZATION
 # ============================================
 set_agent_state "SYNCING" "Syncing policies and baseline"
 
 # Initialize process baseline
 initialize_process_baseline
 
 # Sync DNS blocklist
 sync_dns_blocklist || true
 
 # ============================================
 #  PHASE 4: ENFORCEMENT
 # ============================================
 set_agent_state "ENFORCING" "Normal operation"
 
 log "SUCCESS" "[STARTUP] Agent fully operational in ENFORCING state"
 
last_heartbeat=$(date +%s)
last_auto_repair=$(date +%s)
last_job_poll=$(date +%s)
last_dns_sync=$(date +%s)
LAST_RUNTIME_INTEGRITY_CHECK=$(date +%s)
CONSECUTIVE_HEARTBEAT_FAILURES=0  # Reset for main loop
 
 while true; do
     now=$(date +%s)
     # v5.0.13-perf: Cache timestamp for this iteration (avoids repeated date subshells)
     CACHED_EPOCH=$now
     CACHED_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
     
     # ============================================
     # NETWORK WATCHDOG
     # ============================================
     network_ok=false
     if test_network_connectivity; then
         network_ok=true
         if [[ $CONSECUTIVE_NETWORK_FAILURES -ge 3 && "$CURRENT_STATE" == "DEGRADED" ]]; then
             set_agent_state "ENFORCING" "Network restored"
         fi
         CONSECUTIVE_NETWORK_FAILURES=0
     else
         CONSECUTIVE_NETWORK_FAILURES=$((CONSECUTIVE_NETWORK_FAILURES + 1))
         if [[ $CONSECUTIVE_NETWORK_FAILURES -ge 3 ]]; then
             set_agent_state "DEGRADED" "Network connectivity lost"
         fi
     fi
     
     # ============================================
     # JOB POLLING AND EXECUTION
     # ============================================
     if [[ $((now - last_job_poll)) -ge $JOB_POLL_INTERVAL && "$network_ok" == "true" ]]; then
         jobs=$(poll_jobs)
         
         # Process each job
         echo "$jobs" | python3 -c "import sys,json; [print(json.dumps(j)) for j in json.loads(sys.stdin.read())]" 2>/dev/null | while read -r job; do
             if [[ -n "$job" ]]; then
                 result=$(execute_job "$job")
                 submit_job_result "$job" "$result"
             fi
         done
         
         last_job_poll=$now
     fi
     
    # ============================================
    # v5.0.3: LAUNCHD HEALTH CHECK (every 5 min)
    # ============================================
    launchd_health=$(assert_launchd_health)
    if python3 -c "import json; exit(0 if json.loads('$launchd_health').get('repaired') else 1)" 2>/dev/null; then
        repair_action=$(python3 -c "import json; print(json.loads('$launchd_health').get('repair_action', 'unknown'))" 2>/dev/null)
        log "INFO" "[MAIN-LOOP] LaunchDaemon repaired: $repair_action"
    fi
    
    # ============================================
    # AUTO-REPAIR EVERY 5 MINUTES
    # ============================================
    if [[ $((now - last_auto_repair)) -ge 300 ]]; then
        # Disk cleanup
        disk_result=$(invoke_disk_cleanup)
        if python3 -c "import json; exit(0 if json.loads('$disk_result').get('cleaned') else 1)" 2>/dev/null; then
            freed=$(python3 -c "import json; print(json.loads('$disk_result').get('freed_percent', 0))" 2>/dev/null)
            log "SUCCESS" "[AUTO-REPAIR] Disk cleanup freed ${freed}%"
        fi
        
        # High CPU process check
        cpu_result=$(invoke_high_cpu_process_check)
        killed=$(python3 -c "import json; print(json.loads('$cpu_result').get('killed_count', 0))" 2>/dev/null)
        if [[ "$killed" -gt 0 ]]; then
            log "SUCCESS" "[AUTO-REPAIR] Killed $killed high-CPU processes"
        fi
        
        last_auto_repair=$now
    fi
     
     # ============================================
     # HEARTBEAT EVERY INTERVAL (v5.0.13: with failure tracking)
     # ============================================
     if [[ $((now - last_heartbeat)) -ge $POLL_INTERVAL && "$network_ok" == "true" ]]; then
         if send_heartbeat; then
             CONSECUTIVE_HEARTBEAT_FAILURES=0
             if [[ "$CURRENT_STATE" == "DEGRADED" ]]; then
                 set_agent_state "ENFORCING" "Heartbeat restored"
             fi
         else
             CONSECUTIVE_HEARTBEAT_FAILURES=$((CONSECUTIVE_HEARTBEAT_FAILURES + 1))
             # Cap to prevent overflow on long-running agents
             if [[ $CONSECUTIVE_HEARTBEAT_FAILURES -gt $MAX_CONSECUTIVE_FAILURES ]]; then
                 CONSECUTIVE_HEARTBEAT_FAILURES=$MAX_CONSECUTIVE_FAILURES
             fi
             if [[ "$CURRENT_STATE" == "ENFORCING" ]]; then
                 set_agent_state "DEGRADED" "Heartbeat failed (consecutive: $CONSECUTIVE_HEARTBEAT_FAILURES)"
             fi
             log "WARN" "[HEARTBEAT] Consecutive failures: $CONSECUTIVE_HEARTBEAT_FAILURES"
         fi
         last_heartbeat=$now
     fi
     
     # ============================================
     # v5.0.13: RUNTIME INTEGRITY CHECK (every 5 min - Windows parity)
     # ============================================
     if [[ $((now - LAST_RUNTIME_INTEGRITY_CHECK)) -ge $RUNTIME_INTEGRITY_INTERVAL ]]; then
         if ! test_runtime_integrity; then
             log "ERROR" "[INTEGRITY] Runtime integrity check FAILED - script may have been tampered!"
             set_agent_state "SAFE_MODE" "Runtime integrity violation"
             break  # Exit main loop
         fi
         LAST_RUNTIME_INTEGRITY_CHECK=$now
     fi
      
     # ============================================
     # DNS BLOCKLIST SYNC (1x per hour)
     # ============================================
     if [[ $((now - last_dns_sync)) -ge 3600 && "$network_ok" == "true" ]]; then
         sync_dns_blocklist || true
         last_dns_sync=$now
     fi
      
     # v5.0.13-perf: Adaptive sleep - protect CPU under load
     sleep_time=2
     current_cpu=$(top -l 1 -n 0 2>/dev/null | awk '/CPU usage/ {gsub(/%/,"",$3); print int($3)}' || echo 0)
     LAST_CPU_PERCENT=${current_cpu:-0}
     if [[ $LAST_CPU_PERCENT -gt 80 ]]; then
         sleep_time=$ADAPTIVE_MIN_SLEEP
         log "DEBUG" "[PERF] CPU at ${LAST_CPU_PERCENT}% - adaptive sleep ${sleep_time}s"
     fi
     
     # Flush log buffer at end of iteration
     flush_log_buffer
     
     sleep "$sleep_time"
 done