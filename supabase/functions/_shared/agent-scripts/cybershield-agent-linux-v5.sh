#!/usr/bin/env bash
#
# CyberShield Agent - Linux v5.0.13
#
# v5.0.11: FULL ENTERPRISE - All functions (Get-RollbackState, Add-EvidenceEntry, Apply-ForcedUpdate)
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
# - NEW: light_vuln_scan handler (apt/yum security updates check)
# - NEW: update_agent stub (delegates to heartbeat force_update)
# - NEW: scan, report, collect_info, reinstall_agent handlers
# - FIXED: All 25 job types now supported (eliminates Unknown job type errors)
#
# v5.0.3: STABILITY FIXES - Service Recovery & Task Health
# - FIXED: assert_service_health auto-repairs stopped/disabled systemd units
# - FIXED: DNS Filter check is now non-blocking (graceful degradation)
# - FIXED: Better startup resilience with service health verification
# - IMPROVED: Main loop includes service health checks every 5 minutes
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
#   ./cybershield-agent-linux-v5.sh \
#       --server-url "https://your-project.supabase.co" \
#       --agent-token "AGENT_TOKEN_HERE" \
#       --hmac-secret "64_HEX_CHARS_HERE" \
#       --agent-name "my-server-01"
#

set -euo pipefail

# ============================================
#  CONSTANTS AND GLOBAL VARIABLES
# ============================================
AGENT_VERSION="v5.0.14"
BASE_DIR="/opt/cybershield"
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
    ["INITIALIZING"]="AUTHENTICATING DEGRADED SAFE_MODE SYNCING"
    ["AUTHENTICATING"]="SYNCING DEGRADED SAFE_MODE"
    ["SYNCING"]="ENFORCING DEGRADED SAFE_MODE"
    ["ENFORCING"]="SYNCING DEGRADED SAFE_MODE"
    ["DEGRADED"]="AUTHENTICATING SYNCING ENFORCING SAFE_MODE"
    ["SAFE_MODE"]="INITIALIZING DEGRADED"
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

# v5.0.13-fix: SecurityDegraded flag (fail-closed security model)
SECURITY_DEGRADED=false

# v5.0.13-fix: Consecutive heartbeat failure counter (auth loop prevention)
CONSECUTIVE_HEARTBEAT_FAILURES=0

# v5.0.3: Service Health Check
LAST_SERVICE_HEALTH_CHECK=0
SERVICE_HEALTH_CHECK_INTERVAL=300

# Process baseline array
declare -a PROCESS_BASELINE=()
 
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
 #  v5.0.14: DEPENDENCY VALIDATION AT STARTUP
 # ============================================
 missing_deps=()
 for dep in jq openssl curl nc sha256sum base64; do
     if ! command -v "$dep" &>/dev/null; then
         missing_deps+=("$dep")
     fi
 done
 if [[ ${#missing_deps[@]} -gt 0 ]]; then
     echo "[FATAL] Missing required dependencies: ${missing_deps[*]}"
     echo "Install with: apt-get install -y jq openssl curl netcat-openbsd coreutils"
     exit 1
 fi
 
 # ============================================
 #  LOGGING - v5.0.13-perf: Buffered I/O (reduces disk writes by ~80%)
 # ============================================
 LOG_BUFFER=()
 LOG_BUFFER_SIZE=20
 LOG_BUFFER_LAST_FLUSH=$(date +%s)
 LOG_BUFFER_FLUSH_INTERVAL=10

 flush_log_buffer() {
     if [[ ${#LOG_BUFFER[@]} -eq 0 ]]; then
         return 0
     fi
     printf '%s\n' "${LOG_BUFFER[@]}" >> "$LOG_FILE"
     LOG_BUFFER=()
     LOG_BUFFER_LAST_FLUSH=$(date +%s)
     
     # Log rotation (keep 10MB max)
     local log_size
     log_size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
     if [[ $log_size -gt 10485760 ]]; then
         mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S).bak"
     fi
 }

 # v5.0.13-perf: Guarantee log flush on unexpected exit/shutdown
 trap 'flush_log_buffer' EXIT TERM INT HUP

 log() {
     local level="${1:-INFO}"
     local message="$2"
     local timestamp
     timestamp=$(date '+%Y-%m-%d %H:%M:%S')
     local line="[$timestamp] [$level] [$CURRENT_STATE] $message"
     
     echo "$line"
     LOG_BUFFER+=("$line")
     
     # v5.0.13-perf: Immediate flush for ERROR/WARN levels
     if [[ "$level" == "ERROR" || "$level" == "WARN" ]]; then
         flush_log_buffer
         return 0
     fi
     
     # Flush when buffer is full or interval elapsed
     local now
     now=$(date +%s)
     if [[ ${#LOG_BUFFER[@]} -ge $LOG_BUFFER_SIZE || $((now - LOG_BUFFER_LAST_FLUSH)) -ge $LOG_BUFFER_FLUSH_INTERVAL ]]; then
         flush_log_buffer
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
#  v5.0.3: SERVICE HEALTH CHECK (SYSTEMD)
# ============================================
assert_service_health() {
    local now
    now=$(date +%s)
    
    # Check every 5 minutes
    if [[ $((now - LAST_SERVICE_HEALTH_CHECK)) -lt $SERVICE_HEALTH_CHECK_INTERVAL ]]; then
        echo '{"checked":false,"reason":"interval_not_reached"}'
        return 0
    fi
    
    LAST_SERVICE_HEALTH_CHECK=$now
    
    # Try to find CyberShield systemd service
    local service_name=""
    local service_patterns=("cybershield-agent" "cybershield" "cybershield-agent-${AGENT_NAME}")
    
    for pattern in "${service_patterns[@]}"; do
        if systemctl list-units --type=service --all 2>/dev/null | grep -q "$pattern"; then
            service_name="$pattern"
            break
        fi
    done
    
    if [[ -z "$service_name" ]]; then
        # No systemd service found - might be running directly
        log "DEBUG" "[SERVICE-HEALTH] No systemd service found (running standalone)"
        echo '{"checked":true,"healthy":true,"reason":"standalone_mode"}'
        return 0
    fi
    
    # Check service status
    local is_active
    is_active=$(systemctl is-active "$service_name" 2>/dev/null || echo "unknown")
    
    local is_enabled
    is_enabled=$(systemctl is-enabled "$service_name" 2>/dev/null || echo "unknown")
    
    if [[ "$is_active" == "active" && "$is_enabled" == "enabled" ]]; then
        log "DEBUG" "[SERVICE-HEALTH] Service $service_name is healthy"
        echo "{\"checked\":true,\"healthy\":true,\"service\":\"$service_name\",\"status\":\"$is_active\"}"
        return 0
    fi
    
    # Service needs repair
    log "WARN" "[SERVICE-HEALTH] Service $service_name needs repair (active=$is_active, enabled=$is_enabled)"
    
    local repaired=false
    local repair_actions=""
    
    # Try to enable if disabled
    if [[ "$is_enabled" != "enabled" ]]; then
        if systemctl enable "$service_name" 2>/dev/null; then
            repair_actions="${repair_actions}enabled,"
            repaired=true
            log "SUCCESS" "[SERVICE-HEALTH] Re-enabled service $service_name"
        else
            log "ERROR" "[SERVICE-HEALTH] Failed to enable $service_name"
        fi
    fi
    
    # Try to start if not active
    if [[ "$is_active" != "active" ]]; then
        if systemctl start "$service_name" 2>/dev/null; then
            repair_actions="${repair_actions}started,"
            repaired=true
            log "SUCCESS" "[SERVICE-HEALTH] Started service $service_name"
        else
            log "ERROR" "[SERVICE-HEALTH] Failed to start $service_name"
        fi
    fi
    
    if [[ "$repaired" == "true" ]]; then
        echo "{\"checked\":true,\"healthy\":true,\"repaired\":true,\"repair_action\":\"${repair_actions%,}\",\"service\":\"$service_name\"}"
    else
        echo "{\"checked\":true,\"healthy\":false,\"reason\":\"repair_failed\",\"service\":\"$service_name\"}"
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
             nonce=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N)
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
                 fingerprint=$(openssl dgst -sha256 -binary "$PUBLIC_KEY_PATH" | xxd -p | tr -d '\n')
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
     public_key_b64=$(base64 -w0 "$PUBLIC_KEY_PATH" 2>/dev/null)
     
     local body
     body=$(cat <<EOF
 {"public_key":"$public_key_b64","key_fingerprint":"$SIGNING_FINGERPRINT","algorithm":"ECDSA-P256-SHA256"}
 EOF
 )
     
     local result
     result=$(invoke_secure_request "POST" "/functions/v1/register-agent-key" "$body" 30)
     
     if [[ $? -eq 0 ]]; then
         KEY_VERSION=$(echo "$result" | jq -r '.version // 1' 2>/dev/null)
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
     signature=$(echo -n "$canonical" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" 2>/dev/null | base64 -w0 2>/dev/null)
     
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
     
     # Validate Ed25519 signature format (64 bytes = 88 chars base64)
     local sig_bytes
     sig_bytes=$(echo -n "$signature" | base64 -d 2>/dev/null | wc -c)
     
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
     hash=$(echo -n "$payload" | sha256sum | cut -d' ' -f1)
     
     EXECUTION_CHAIN_LAST_HASH="$hash"
     
     echo "{\"execution_hash\":\"$hash\",\"previous_execution_hash\":\"$previous_hash\",\"execution_index\":$index}"
 }
 
# ============================================
#  v5.0.1: PROTECTED PROCESSES AND SERVICES
#  Defense-in-depth: Agent-side validation
# ============================================
PROTECTED_PROCESSES="init systemd journald sshd cron dbus NetworkManager systemd-logind systemd-udevd polkitd accounts-daemon"
PROTECTED_SERVICES="sshd dbus NetworkManager systemd-journald systemd-logind systemd-udevd polkit cron rsyslog auditd firewalld iptables"

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
#  v5.0.1: STOP SERVICE HANDLER
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
    
    # Check if systemd or sysvinit
    if command -v systemctl &>/dev/null; then
        local status
        status=$(systemctl is-active "$service_name" 2>/dev/null)
        
        if [[ "$status" == "inactive" ]] || [[ "$status" == "dead" ]]; then
            echo "{\"success\":true,\"service_name\":\"$service_name\",\"status\":\"already_stopped\"}"
            return
        fi
        
        if systemctl stop "$service_name" 2>/dev/null; then
            log "SUCCESS" "[STOP-SERVICE] Stopped: $service_name"
            echo "{\"success\":true,\"service_name\":\"$service_name\",\"previous_status\":\"$status\",\"new_status\":\"stopped\",\"stopped_at\":\"$(date -Iseconds)\"}"
        else
            echo "{\"success\":false,\"error\":\"Failed to stop service: $service_name\"}"
        fi
    else
        echo '{"success":false,"error":"systemctl not available"}'
    fi
}

# ============================================
#  v5.0.1: DISABLE SERVICE HANDLER
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
    
    if command -v systemctl &>/dev/null; then
        local prev_status
        prev_status=$(systemctl is-active "$service_name" 2>/dev/null)
        local prev_enabled
        prev_enabled=$(systemctl is-enabled "$service_name" 2>/dev/null)
        
        # Stop and disable
        systemctl stop "$service_name" 2>/dev/null
        if systemctl disable "$service_name" 2>/dev/null; then
            log "SUCCESS" "[DISABLE-SERVICE] Disabled: $service_name"
            echo "{\"success\":true,\"service_name\":\"$service_name\",\"previous_status\":\"$prev_status\",\"previous_enabled\":\"$prev_enabled\",\"new_status\":\"stopped\",\"new_enabled\":\"disabled\",\"disabled_at\":\"$(date -Iseconds)\"}"
        else
            echo "{\"success\":false,\"error\":\"Failed to disable service: $service_name\"}"
        fi
    else
        echo '{"success":false,"error":"systemctl not available"}'
    fi
}

# ============================================
#  v5.0.1: RESTART SERVICE HANDLER
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
    
    if command -v systemctl &>/dev/null; then
        local prev_status
        prev_status=$(systemctl is-active "$service_name" 2>/dev/null)
        
        if systemctl restart "$service_name" 2>/dev/null; then
            local new_status
            new_status=$(systemctl is-active "$service_name" 2>/dev/null)
            log "SUCCESS" "[RESTART-SERVICE] Restarted: $service_name"
            echo "{\"success\":true,\"service_name\":\"$service_name\",\"previous_status\":\"$prev_status\",\"new_status\":\"$new_status\",\"restarted_at\":\"$(date -Iseconds)\"}"
        else
            echo "{\"success\":false,\"error\":\"Failed to restart service: $service_name\"}"
        fi
    else
        echo '{"success":false,"error":"systemctl not available"}'
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
     
     # v5.0.12 FIX: Backend may return wrapped {jobs:[...]} or flat array [...]
     # Extract jobs array from either format
     local jobs_array
     if echo "$result" | jq -e '.jobs' &>/dev/null; then
         # Wrapped format: { jobs: [...], poll_interval_seconds: N }
         jobs_array=$(echo "$result" | jq -c '.jobs')
         # Read dynamic poll interval
         local new_interval
         new_interval=$(echo "$result" | jq -r '.poll_interval_seconds // 0' 2>/dev/null)
         if [[ "$new_interval" -ge 10 && "$new_interval" != "$JOB_POLL_INTERVAL" ]]; then
             log "INFO" "[POLL-JOBS] Server adjusted job poll interval: ${JOB_POLL_INTERVAL}s -> ${new_interval}s"
             JOB_POLL_INTERVAL=$new_interval
         fi
     else
         # Flat array format (legacy)
         jobs_array="$result"
     fi
     
     local count
     count=$(echo "$jobs_array" | jq 'length' 2>/dev/null || echo 0)
     
     if [[ "$count" -gt 0 ]]; then
         log "INFO" "[POLL-JOBS] Received $count job(s)"
     fi
     
     echo "$jobs_array"
 }
 
 execute_job() {
     local job="$1"
     local start_time
     start_time=$(date +%s)
     
     local execution_id
     execution_id=$(echo "$job" | jq -r '.execution_id' 2>/dev/null)
     local job_id
     job_id=$(echo "$job" | jq -r '.id' 2>/dev/null)
     local job_type
     job_type=$(echo "$job" | jq -r '.job_type // .type' 2>/dev/null)
     
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
     output_hash=$(echo -n "$output" | sha256sum | cut -d' ' -f1)
     
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
     local software_list
     software_list=$(dpkg-query -W -f='{"name":"${Package}","version":"${Version}"},\n' 2>/dev/null | sed '$ s/,$//' | tr -d '\n' || echo '{}')
     
     local count
     count=$(dpkg-query -W 2>/dev/null | wc -l || echo 0)
     
     cat <<EOF
 {"software_count":$count,"software_list":[$software_list],"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 collect_antivirus_status() {
     local av_list='[]'
     
     # Check common Linux AV products
     if command -v clamscan &>/dev/null; then
         local version
         version=$(clamscan --version 2>/dev/null | head -1 || echo "unknown")
         av_list="[{\"name\":\"ClamAV\",\"version\":\"$version\",\"state\":\"installed\"}]"
     fi
     
     cat <<EOF
 {"antivirus_products":$av_list,"count":$(echo "$av_list" | jq 'length'),"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 collect_network_info() {
     local adapters
     adapters=$(ip -j link show 2>/dev/null | jq -c '[.[] | {name: .ifname, mac: .address, state: .operstate}]' 2>/dev/null || echo '[]')
     
     local ip_addresses
     ip_addresses=$(ip -j -4 addr show 2>/dev/null | jq -c '[.[] | .addr_info[] | {ip: .local, prefix: .prefixlen}]' 2>/dev/null || echo '[]')
     
     cat <<EOF
 {"adapters":$adapters,"ip_addresses":$ip_addresses,"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 fix_firewall() {
     local job="$1"
     local payload
     payload=$(echo "$job" | jq -c '.payload // {}')
     
     local results='{}'
     
     # Check if ufw is available
     if command -v ufw &>/dev/null; then
         local enable
         enable=$(echo "$payload" | jq -r '.enable // false')
         
         if [[ "$enable" == "true" ]]; then
             ufw --force enable 2>/dev/null || true
             results='{"ufw":"enabled"}'
         fi
     elif command -v firewalld &>/dev/null; then
         systemctl start firewalld 2>/dev/null || true
         results='{"firewalld":"started"}'
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
     
     local domains
     domains=$(echo "$result" | jq -c '.domains // []' 2>/dev/null)
     local count
     count=$(echo "$domains" | jq 'length' 2>/dev/null || echo 0)
     
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
     
     local freed_bytes=0
     local actions=()
     
     # Clean /tmp
     local tmp_size
     tmp_size=$(du -sb /tmp 2>/dev/null | cut -f1 || echo 0)
     find /tmp -type f -mtime +7 -delete 2>/dev/null || true
     freed_bytes=$((freed_bytes + tmp_size / 2))
     actions+=("tmp_cleanup")
     
     # Clean /var/tmp
     find /var/tmp -type f -mtime +7 -delete 2>/dev/null || true
     actions+=("var_tmp_cleanup")
     
     # Clean old journals
     if command -v journalctl &>/dev/null; then
         journalctl --vacuum-time=7d 2>/dev/null || true
         actions+=("journal_cleanup")
     fi
     
     # Clean package cache
     if command -v apt-get &>/dev/null; then
         apt-get clean 2>/dev/null || true
         actions+=("apt_cache_clean")
     elif command -v yum &>/dev/null; then
         yum clean all 2>/dev/null || true
         actions+=("yum_cache_clean")
     fi
     
     local disk_usage_after
     disk_usage_after=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
     local freed_percent=$((disk_usage - disk_usage_after))
     
     log "SUCCESS" "[DISK-CLEANUP] Completed. Usage: $disk_usage% -> $disk_usage_after% (freed: ${freed_percent}%)"
     
     AUTO_REPAIR_DISK_CLEANUPS=$((AUTO_REPAIR_DISK_CLEANUPS + 1))
     AUTO_REPAIR_LAST_DISK_CLEANUP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
     
     echo '{"cleaned":true,"before_percent":'$disk_usage',"after_percent":'$disk_usage_after',"freed_percent":'$freed_percent',"actions":["'"$(IFS=','; echo "${actions[*]}")"'"]}'
 }
 
 # ============================================
 #  v5.0.1: AUTO-REPAIR - HIGH CPU PROCESS CHECK
 # ============================================
 invoke_high_cpu_process_check() {
     # Protected processes (NEVER kill)
     local protected_processes=(
         "systemd" "init" "kthreadd" "sshd" "dbus-daemon"
         "systemd-journald" "systemd-udevd" "systemd-logind"
         "rsyslogd" "syslogd" "auditd" "polkitd"
         "bash" "cybershield"
     )
     
     local killed_count=0
     local killed_list='[]'
     
     # Get processes using more than threshold CPU
     local high_cpu_procs
     high_cpu_procs=$(ps aux --sort=-%cpu | awk -v threshold="$HIGH_CPU_THRESHOLD" 'NR>1 && $3 > threshold {print $2 ":" $11 ":" $3}' | head -5)
     
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
             
             # v5.0.13-perf: O(1) baseline lookup via associative array
             local in_baseline=false
             if [[ -n "${PROCESS_BASELINE_MAP[$name]+x}" ]]; then
                 in_baseline=true
             fi
             
             if [[ "$in_baseline" == "false" ]]; then
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
     top_by_cpu=$(ps aux --sort=-%cpu | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
     
     local top_by_memory
     top_by_memory=$(ps aux --sort=-%mem | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
     
     local total_procs
     total_procs=$(ps aux | wc -l)
     
     cat <<EOF
 {"top_by_cpu":[$top_by_cpu],"top_by_memory":[$top_by_memory],"total_processes":$total_procs,"collected_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 # ============================================
 #  v5.0.1: PROCESS BASELINE
 # ============================================
 # v5.0.13-perf: Use associative array for O(1) baseline lookups instead of O(n) linear scan
 declare -A PROCESS_BASELINE_MAP=()

 initialize_process_baseline() {
     if [[ -f "$PROCESS_BASELINE_PATH" ]]; then
         mapfile -t PROCESS_BASELINE < <(jq -r '.[].name' "$PROCESS_BASELINE_PATH" 2>/dev/null)
         for p in "${PROCESS_BASELINE[@]}"; do
             PROCESS_BASELINE_MAP["$p"]=1
         done
         log "INFO" "[BASELINE] Loaded baseline with ${#PROCESS_BASELINE[@]} processes"
     else
         log "INFO" "[BASELINE] Creating initial process baseline..."
         
         local baseline='['
         local first=true
         for proc in $(ps -eo comm= | sort -u); do
             if [[ "$first" == "true" ]]; then
                 first=false
             else
                 baseline+=','
             fi
             baseline+="{\"name\":\"$proc\",\"first_seen\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}"
             PROCESS_BASELINE+=("$proc")
             PROCESS_BASELINE_MAP["$proc"]=1
         done
         baseline+=']'
         
         echo "$baseline" > "$PROCESS_BASELINE_PATH"
         log "SUCCESS" "[BASELINE] Created baseline with ${#PROCESS_BASELINE[@]} processes"
     fi
 }
 
 # v5.0.13-perf: O(1) lookups via associative array
 get_process_anomalies() {
     local current_procs
     mapfile -t current_procs < <(ps -eo comm= | sort -u)
     
     local anomaly_count=0
     
     for proc in "${current_procs[@]}"; do
         if [[ -z "${PROCESS_BASELINE_MAP[$proc]+x}" ]]; then
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
     cpu_percent=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d. -f1 2>/dev/null || echo 0)
     
     local mem_info
     mem_info=$(free -b 2>/dev/null)
     local mem_total
     mem_total=$(echo "$mem_info" | awk '/Mem:/ {print $2}')
     local mem_used
     mem_used=$(echo "$mem_info" | awk '/Mem:/ {print $3}')
     local mem_percent
     mem_percent=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc 2>/dev/null || echo 0)
     
     local disk_info
     disk_info=$(df / | tail -1)
     local disk_total
     disk_total=$(echo "$disk_info" | awk '{print $2}')
     local disk_used
     disk_used=$(echo "$disk_info" | awk '{print $3}')
     local disk_percent
     disk_percent=$(echo "$disk_info" | awk '{print $5}' | tr -d '%')
     
     local uptime_seconds
     uptime_seconds=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)
     
     cat <<EOF
 {"cpu_percent":$cpu_percent,"memory_total_gb":$(echo "scale=2; $mem_total / 1073741824" | bc 2>/dev/null || echo 0),"memory_used_gb":$(echo "scale=2; $mem_used / 1073741824" | bc 2>/dev/null || echo 0),"memory_used_percent":$mem_percent,"disk_total_gb":$(echo "scale=2; $disk_total / 1048576" | bc 2>/dev/null || echo 0),"disk_used_percent":$disk_percent,"uptime_seconds":$uptime_seconds}
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
     anomaly_count=$(echo "$anomalies" | jq -r '.anomaly_count' 2>/dev/null || echo 0)
     
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
             force_update=$(echo "$result" | jq -r '.force_update // false' 2>/dev/null)
             
             if [[ "$force_update" == "true" ]]; then
                 log "WARN" "[FORCE UPDATE] Update forcado detectado via heartbeat!"
                 local target_version
                 target_version=$(echo "$result" | jq -r '.target_version // ""' 2>/dev/null)
                 log "INFO" "[FORCE UPDATE] Target version: $target_version"
                 
             apply_forced_update "$result"
              fi
              
              # ============================================
              # v5.0.9: DYNAMIC POLLING INTERVALS FROM SERVER
              # Server controls agent cadence via heartbeat response
              # ============================================
              local new_hb_interval
              new_hb_interval=$(echo "$result" | jq -r '.heartbeat_interval_seconds // 0' 2>/dev/null)
              if [[ "$new_hb_interval" -ge 10 && "$new_hb_interval" != "$POLL_INTERVAL" ]]; then
                  log "INFO" "[HEARTBEAT] Server adjusted heartbeat interval: ${POLL_INTERVAL}s -> ${new_hb_interval}s"
                  POLL_INTERVAL=$new_hb_interval
              fi
              
              local new_job_interval
              new_job_interval=$(echo "$result" | jq -r '.poll_interval_seconds // 0' 2>/dev/null)
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
     target_version=$(echo "$response" | jq -r '.target_version // ""' 2>/dev/null)
     local base64_content
     base64_content=$(echo "$response" | jq -r '.script_content_base64 // ""' 2>/dev/null)
     local expected_hash
     expected_hash=$(echo "$response" | jq -r '.sha256 // ""' 2>/dev/null)
     local reason
     reason=$(echo "$response" | jq -r '.reason // "heartbeat_force_update"' 2>/dev/null)
     
     if [[ -z "$target_version" || -z "$base64_content" || -z "$expected_hash" ]]; then
         log "ERROR" "[FORCE UPDATE] Dados incompletos no response"
         return 1
     fi
     
     log "INFO" "[FORCE UPDATE] Version: $target_version, Reason: $reason"
     
     # Decode Base64
     local temp_script="/tmp/cybershield-force-update-${target_version}.sh"
     echo "$base64_content" | base64 -d > "$temp_script" 2>/dev/null
     
     if [[ ! -s "$temp_script" ]]; then
         log "ERROR" "[FORCE UPDATE] Base64 decode falhou"
         rm -f "$temp_script"
         return 1
     fi
     
     local decoded_size
     decoded_size=$(stat -c%s "$temp_script" 2>/dev/null || stat -f%z "$temp_script" 2>/dev/null)
     log "DEBUG" "[FORCE UPDATE] Script decodificado: $decoded_size bytes"
     
     # Validate SHA256
     local actual_hash
     actual_hash=$(sha256sum "$temp_script" 2>/dev/null | awk '{print $1}')
     
     if [[ "${actual_hash,,}" != "${expected_hash,,}" ]]; then
         log "ERROR" "[FORCE UPDATE] SHA256 mismatch! Esperado: $expected_hash, Obtido: $actual_hash"
         rm -f "$temp_script"
         return 1
     fi
     
     log "SUCCESS" "[FORCE UPDATE] SHA256 validado: $actual_hash"
     
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
     current_script=$(readlink -f "$0" 2>/dev/null || echo "$0")
     
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
     confirm_payload="{\"agent_name\":\"$AGENT_NAME\",\"old_version\":\"$AGENT_VERSION\",\"new_version\":\"$target_version\",\"sha256\":\"$actual_hash\",\"method\":\"heartbeat_force_update\",\"platform\":\"linux\",\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}"
     
     invoke_secure_request "POST" "/functions/v1/confirm-force-update" "$confirm_payload" 10 1 2>/dev/null || true
     
     log "INFO" "[FORCE UPDATE] Reiniciando agente com nova versao..."
     
     # v5.0.14-fix: Retry limit for update restart (max 3 attempts to prevent infinite loop)
     local restart_attempt=0
     local restart_max=3
     local restart_success=false
     
     while [[ $restart_attempt -lt $restart_max ]]; do
         restart_attempt=$((restart_attempt + 1))
         log "INFO" "[FORCE UPDATE] Restart attempt $restart_attempt/$restart_max..."
         
         if systemctl is-active cybershield-agent &>/dev/null; then
             sudo systemctl restart cybershield-agent &
             restart_success=true
             break
         elif systemctl is-active --user cybershield-agent &>/dev/null; then
             systemctl restart --user cybershield-agent &
             restart_success=true
             break
         else
             # Fallback: exec into new script
             exec "$current_script" --server-url "$SERVER_URL" --agent-token "$AGENT_TOKEN" --hmac-secret "$HMAC_SECRET" --agent-name "$AGENT_NAME" &
             restart_success=true
             break
         fi
         sleep 2
     done
     
     if [[ "$restart_success" == "false" ]]; then
         log "ERROR" "[FORCE UPDATE] All $restart_max restart attempts failed - rolling back"
         if [[ -f "${current_script}.backup" ]]; then
             cp "${current_script}.backup" "$current_script" 2>/dev/null
             log "WARN" "[FORCE UPDATE] Rolled back to previous version"
         fi
         return 1
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
     urls=$(echo "$job" | jq -r '.payload.urls // [] | .[]' 2>/dev/null)
     
     local blocked=0
     local marker_start="# === CyberShield Blocked Websites Start ==="
     local marker_end="# === CyberShield Blocked Websites End ==="
     local hosts_file="/etc/hosts"
     
     # Remove existing blocks
     sudo sed -i "/$marker_start/,/$marker_end/d" "$hosts_file" 2>/dev/null
     
     # Add new blocks
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
     
     cat <<EOF
 {"success":true,"blocked_count":$blocked,"method":"hosts_file","synced_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 service_health_check_handler() {
     local job="$1"
     local services
     services=$(echo "$job" | jq -r '.payload.services // ["sshd","cron","rsyslog","systemd-resolved"] | .[]' 2>/dev/null)
     
     local results="[]"
     local unhealthy=0
     local checked=0
     
     while IFS= read -r svc; do
         if [[ -n "$svc" ]]; then
             local status="unknown"
             local healthy="false"
             if systemctl is-active "$svc" &>/dev/null; then
                 status="running"
                 healthy="true"
             elif systemctl is-enabled "$svc" &>/dev/null; then
                 status="stopped"
                 unhealthy=$((unhealthy + 1))
             else
                 status="not_found"
                 unhealthy=$((unhealthy + 1))
             fi
             results=$(echo "$results" | jq --arg n "$svc" --arg s "$status" --argjson h "$healthy" '. + [{"name":$n,"status":$s,"healthy":$h}]')
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
     targets=$(echo "$job" | jq -r '.payload.targets // ["8.8.8.8","1.1.1.1"] | .[]' 2>/dev/null)
     
     local diagnostics="[]"
     
     while IFS= read -r target; do
         if [[ -n "$target" ]]; then
             local ping_result="null"
             local dns_result="null"
             local trace_result="null"
             
             # Ping
             if ping_out=$(ping -c 3 -W 5 "$target" 2>/dev/null); then
                 local avg_ms
                 avg_ms=$(echo "$ping_out" | tail -1 | awk -F'/' '{print $5}' 2>/dev/null)
                 ping_result="{\"success\":true,\"avg_ms\":${avg_ms:-0}}"
             else
                 ping_result='{"success":false}'
             fi
             
             # DNS
             if dig_out=$(dig +short "$target" 2>/dev/null | head -3); then
                 dns_result="{\"success\":true,\"records\":\"$dig_out\"}"
             else
                 dns_result='{"success":false}'
             fi
             
             # Traceroute (limited)
             if trace_out=$(traceroute -m 10 -w 2 "$target" 2>/dev/null | tail -n +2 | head -5); then
                 trace_result='{"success":true,"hops":5}'
             else
                 trace_result='{"success":false}'
             fi
             
             diagnostics=$(echo "$diagnostics" | jq --arg t "$target" --argjson p "$ping_result" --argjson d "$dns_result" --argjson tr "$trace_result" '. + [{"target":$t,"ping":$p,"dns":$d,"traceroute":$tr}]')
         fi
     done <<< "$targets"
     
     cat <<EOF
 {"success":true,"diagnostics":$diagnostics,"checked_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
 EOF
 }
 
 quarantine_agent_handler() {
     local job="$1"
     local action
     action=$(echo "$job" | jq -r '.payload.action // "quarantine"' 2>/dev/null)
     local server_host
     server_host=$(echo "$SERVER_URL" | sed 's|https\?://||' | sed 's|/.*||')
     
     if [[ "$action" == "release" ]]; then
         sudo iptables -D OUTPUT -j DROP 2>/dev/null
         sudo iptables -D OUTPUT -d "$server_host" -j ACCEPT 2>/dev/null
         sudo iptables -D OUTPUT -p udp --dport 53 -j ACCEPT 2>/dev/null
         echo '{"success":true,"action":"released","released_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
     else
         # Allow server and DNS, block rest
         sudo iptables -A OUTPUT -d "$server_host" -j ACCEPT 2>/dev/null
         sudo iptables -A OUTPUT -p udp --dport 53 -j ACCEPT 2>/dev/null
         sudo iptables -A OUTPUT -o lo -j ACCEPT 2>/dev/null
         sudo iptables -A OUTPUT -j DROP 2>/dev/null
         echo '{"success":true,"action":"quarantined","server_host":"'"$server_host"'","quarantined_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
     fi
 }
 
 apply_security_patch_handler() {
     local job="$1"
     local package
     package=$(echo "$job" | jq -r '.payload.package // ""' 2>/dev/null)
     local cve_id
     cve_id=$(echo "$job" | jq -r '.payload.cve_id // ""' 2>/dev/null)
     
     if command -v apt-get &>/dev/null; then
         sudo apt-get update -qq 2>/dev/null
         if [[ -n "$package" ]]; then
             sudo apt-get install --only-upgrade -y "$package" 2>/dev/null
         else
             sudo apt-get upgrade -y --with-new-pkgs 2>/dev/null
         fi
     elif command -v yum &>/dev/null; then
         if [[ -n "$package" ]]; then
             sudo yum update -y "$package" 2>/dev/null
         else
             sudo yum update -y --security 2>/dev/null
         fi
     fi
     
     echo '{"success":true,"cve_id":"'"$cve_id"'","patched_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
 }
 
 disk_cleanup_handler() {
     local before_free
     before_free=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
     
     # Clean temp files
     sudo find /tmp -type f -atime +7 -delete 2>/dev/null
     sudo find /var/tmp -type f -atime +7 -delete 2>/dev/null
     # Clean old logs
     sudo find /var/log -name "*.gz" -mtime +30 -delete 2>/dev/null
     sudo journalctl --vacuum-time=7d 2>/dev/null
     # Clean package cache
     if command -v apt-get &>/dev/null; then
         sudo apt-get autoremove -y 2>/dev/null
         sudo apt-get clean 2>/dev/null
     fi
     
     local after_free
     after_free=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
     local freed=$((after_free - before_free))
     
     echo '{"success":true,"freed_gb":'$freed',"before_free_gb":'$before_free',"after_free_gb":'$after_free',"cleaned_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
 }

# ============================================
#  v5.0.5: NEW HANDLERS - Handler Parity
# ============================================

collect_web_activity_handler() {
    log "INFO" "[JOB] Collecting web activity (DNS cache + browser history)"
    
    # Collect DNS cache
    local dns_entries='[]'
    if command -v systemd-resolve &>/dev/null; then
        dns_entries=$(systemd-resolve --statistics 2>/dev/null | head -20 | jq -R -s '[split("\n")[] | select(length > 0) | {entry: .}]' 2>/dev/null || echo '[]')
    elif [[ -f /etc/resolv.conf ]]; then
        dns_entries=$(cat /etc/resolv.conf 2>/dev/null | grep -v '^#' | grep -v '^$' | jq -R -s '[split("\n")[] | select(length > 0) | {entry: .}]' 2>/dev/null || echo '[]')
    fi
    
    # Collect browser history (Firefox)
    local browser_history='[]'
    local firefox_db
    firefox_db=$(find /home -name "places.sqlite" -path "*/.mozilla/firefox/*" 2>/dev/null | head -1)
    if [[ -n "$firefox_db" ]]; then
        local tmp_db="/tmp/cybershield_places_$(date +%s).sqlite"
        cp "$firefox_db" "$tmp_db" 2>/dev/null
        if command -v sqlite3 &>/dev/null; then
            browser_history=$(sqlite3 "$tmp_db" "SELECT url, title, last_visit_date FROM moz_places ORDER BY last_visit_date DESC LIMIT 50;" 2>/dev/null | \
                awk -F'|' '{printf "{\"url\":\"%s\",\"title\":\"%s\",\"visited_at\":\"%s\"},", $1, $2, $3}' | sed 's/,$//' | sed 's/^/[/' | sed 's/$/]/' 2>/dev/null || echo '[]')
        fi
        rm -f "$tmp_db" 2>/dev/null
    fi
    
    local collected_at
    collected_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo '{"dns_cache":'"$dns_entries"',"browser_history":'"$browser_history"',"collected_at":"'"$collected_at"'","source":"linux"}'
}

light_vuln_scan_handler() {
    log "INFO" "[JOB] Running light vulnerability scan"
    
    local vulns='[]'
    local scan_tool="none"
    local total=0
    local critical=0
    local high=0
    
    if command -v apt-get &>/dev/null; then
        scan_tool="apt"
        # Check for security updates
        local security_updates
        security_updates=$(apt-get -s upgrade 2>/dev/null | grep -i "^Inst" | grep -i "security" || echo "")
        
        if [[ -n "$security_updates" ]]; then
            vulns=$(echo "$security_updates" | head -50 | while read -r line; do
                local pkg
                pkg=$(echo "$line" | awk '{print $2}')
                local ver
                ver=$(echo "$line" | awk '{print $3}' | tr -d '[]')
                echo "{\"package\":\"$pkg\",\"current_version\":\"$ver\",\"severity\":\"high\",\"source\":\"apt-security\"}"
            done | jq -s '.' 2>/dev/null || echo '[]')
            total=$(echo "$vulns" | jq 'length' 2>/dev/null || echo 0)
            high=$total
        fi
    elif command -v yum &>/dev/null; then
        scan_tool="yum"
        local yum_sec
        yum_sec=$(yum updateinfo list security 2>/dev/null | tail -n +3 | head -50 || echo "")
        if [[ -n "$yum_sec" ]]; then
            vulns=$(echo "$yum_sec" | while read -r sev _ pkg; do
                echo "{\"package\":\"$pkg\",\"severity\":\"$sev\",\"source\":\"yum-security\"}"
            done | jq -s '.' 2>/dev/null || echo '[]')
            total=$(echo "$vulns" | jq 'length' 2>/dev/null || echo 0)
        fi
    fi
    
    local scanned_at
    scanned_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    echo '{"vulnerabilities":'"$vulns"',"summary":{"total":'$total',"critical":'$critical',"high":'$high',"medium":0,"low":0},"scan_tool":"'"$scan_tool"'","scanned_at":"'"$scanned_at"'","platform":"linux"}'
}

update_agent_handler() {
    log "INFO" "[JOB] update_agent received - delegating to heartbeat force_update mechanism"
    echo '{"success":true,"message":"Update delegated to heartbeat force_update mechanism","agent_version":"'"$AGENT_VERSION"'","timestamp":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

scan_handler() {
    log "INFO" "[JOB] Running general security scan"
    local open_ports
    open_ports=$(ss -tlnp 2>/dev/null | tail -n +2 | awk '{print $4}' | head -20 | jq -R -s '[split("\n")[] | select(length > 0)]' 2>/dev/null || echo '[]')
    local users_logged
    users_logged=$(who 2>/dev/null | jq -R -s '[split("\n")[] | select(length > 0)]' 2>/dev/null || echo '[]')
    local uptime_info
    uptime_info=$(uptime 2>/dev/null || echo "unknown")
    echo '{"open_ports":'"$open_ports"',"logged_users":'"$users_logged"',"uptime":"'"$uptime_info"'","scanned_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

report_handler() {
    log "INFO" "[JOB] Generating agent report"
    local disk_usage
    disk_usage=$(df -BG / | tail -1 | awk '{print "{\"total\":\""$2"\",\"used\":\""$3"\",\"free\":\""$4"\",\"percent\":\""$5"\"}"}')
    local mem_info
    mem_info=$(free -m 2>/dev/null | awk '/^Mem:/ {print "{\"total_mb\":"$2",\"used_mb\":"$3",\"free_mb\":"$4"}"}' || echo '{}')
    echo '{"agent_version":"'"$AGENT_VERSION"'","hostname":"'$(hostname)'"','$disk_usage',"memory":'"$mem_info"',"generated_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

collect_info_handler() {
    log "INFO" "[JOB] Collecting system info"
    local os_info
    os_info=$(cat /etc/os-release 2>/dev/null | head -5 | jq -R -s '[split("\n")[] | select(length > 0)]' 2>/dev/null || echo '[]')
    local kernel
    kernel=$(uname -r 2>/dev/null || echo "unknown")
    local arch
    arch=$(uname -m 2>/dev/null || echo "unknown")
    echo '{"os_info":'"$os_info"',"kernel":"'"$kernel"'","architecture":"'"$arch"'","hostname":"'$(hostname)'","agent_version":"'"$AGENT_VERSION"'","collected_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

reinstall_agent_handler() {
    log "INFO" "[JOB] Reinstall agent requested"
    # Download latest script and replace current
    local download_url="${SERVER_URL}/functions/v1/serve-agent-update?platform=linux"
    local new_script
    new_script=$(curl -s -H "X-Agent-Token: $AGENT_TOKEN" "$download_url" 2>/dev/null)
    if [[ -n "$new_script" && ${#new_script} -gt 1000 ]]; then
        local script_path
        script_path=$(readlink -f "$0" 2>/dev/null || echo "$0")
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
        blocks=$(grep -E "^(0\.0\.0\.0|127\.0\.0\.1)" /etc/hosts 2>/dev/null | grep -v "localhost" | awk '{print $2}' | head -100 | jq -R -s '[split("\n")[] | select(length > 0)]' 2>/dev/null || echo '[]')
    fi
    echo '{"blocked_domains":'"$blocks"',"source":"/etc/hosts","collected_at":"'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'
}

remove_dns_filter_handler() {
    log "INFO" "[JOB] Removing DNS filter entries from hosts file"
    if [[ -f /etc/hosts ]]; then
        local count_before
        count_before=$(grep -cE "^(0\.0\.0\.0|127\.0\.0\.1)" /etc/hosts 2>/dev/null | grep -v "localhost" || echo 0)
        sudo sed -i '/# CyberShield DNS Block/,/# End CyberShield DNS Block/d' /etc/hosts 2>/dev/null
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
 log "INFO" "============================================"
 log "INFO" "[START] CyberShield Agent $AGENT_VERSION FULL ENTERPRISE"
 log "DEBUG" "[INFO] ServerUrl: $SERVER_URL"
 log "DEBUG" "[INFO] AgentName: $AGENT_NAME"
 log "INFO" "[INFO] Features: ECDSA-signing, Ed25519-verify, hash-chain, FSM, DNS-filter, auto-remediation"
 log "INFO" "============================================"
 
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
 SECURITY_DEGRADED=false
 CONSECUTIVE_HEARTBEAT_FAILURES=0
 if initialize_agent_keys; then
     keys_initialized=true
 else
     log "ERROR" "[STARTUP] Failed to initialize keys - entering DEGRADED mode (FAIL-CLOSED)"
     set_agent_state "DEGRADED" "Key initialization failed"
     SECURITY_DEGRADED=true
     log "WARN" "[SECURITY] SecurityDegraded=TRUE - operational jobs will be BLOCKED until crypto is restored"
 fi
 
 # ============================================
 #  PHASE 2: AUTHENTICATION
 # ============================================
 # v5.0.13-fix: Guard - only transition to AUTHENTICATING if not stuck in DEGRADED with failed keys
 if [[ "$SECURITY_DEGRADED" == "true" ]]; then
     log "WARN" "[STARTUP] Skipping AUTHENTICATING - SecurityDegraded, staying in DEGRADED for heartbeat attempt"
 else
     set_agent_state "AUTHENTICATING" "Validating credentials"
 fi
 
 # Send first heartbeat
 heartbeat_success=false
 if send_heartbeat; then
     heartbeat_success=true
     
     # Register public key
     if [[ "$keys_initialized" == "true" ]]; then
         register_agent_key || log "WARN" "[STARTUP] Key registration failed"
     fi
     CONSECUTIVE_HEARTBEAT_FAILURES=0
 else
     log "WARN" "[STARTUP] Initial heartbeat failed - entering DEGRADED mode"
     set_agent_state "DEGRADED" "Heartbeat failed"
     CONSECUTIVE_HEARTBEAT_FAILURES=$((CONSECUTIVE_HEARTBEAT_FAILURES + 1))
     
     # v5.0.13-fix: If BOTH keys and heartbeat failed, enter SAFE_MODE (fail-closed)
     if [[ "$keys_initialized" == "false" ]]; then
         log "ERROR" "[SECURITY] No crypto + no auth = SAFE_MODE (fail-closed)"
         set_agent_state "SAFE_MODE" "No auth + no crypto - fail closed"
     fi
 fi
 
 # ============================================
 #  PHASE 3: SYNCHRONIZATION
 # ============================================
 # v5.0.13-fix: If in SAFE_MODE after startup failures, enter recovery loop
 if [[ "$CURRENT_STATE" == "SAFE_MODE" ]]; then
     log "WARN" "[STARTUP] Agent in SAFE_MODE - entering recovery-only loop"
     recovery_attempt=0
     while [[ "$CURRENT_STATE" == "SAFE_MODE" ]]; do
         recovery_attempt=$((recovery_attempt + 1))
         # Exponential backoff (60s, 120s, 240s... max 600s)
         recovery_delay=$((60 * (2 ** (recovery_attempt - 1))))
         [[ $recovery_delay -gt 600 ]] && recovery_delay=600
         log "INFO" "[SAFE_MODE] Recovery attempt #$recovery_attempt - waiting ${recovery_delay}s..."
         sleep "$recovery_delay"
         log "INFO" "[SAFE_MODE] Attempting recovery heartbeat..."
         if send_heartbeat; then
             if initialize_agent_keys; then
                 SECURITY_DEGRADED=false
                 set_agent_state "INITIALIZING" "Recovery successful"
                 log "SUCCESS" "[SAFE_MODE] Recovery successful - restarting initialization"
                 break
             else
                 log "WARN" "[SAFE_MODE] Heartbeat OK but keys still failed - continuing recovery"
             fi
         fi
     done
 fi

 set_agent_state "SYNCING" "Syncing policies and baseline"
 
 # v5.0.13-fix: Guard against duplicate baseline initialization
 if [[ ${#PROCESS_BASELINE[@]} -eq 0 ]]; then
     initialize_process_baseline
 else
     log "DEBUG" "[BASELINE] Already initialized, skipping duplicate call"
 fi
 
 # Sync DNS blocklist
 sync_dns_blocklist || true
 
 # ============================================
 #  PHASE 4: ENFORCEMENT
 # ============================================
 # v5.0.13-fix: Only enter ENFORCING if security is not degraded
 if [[ "$SECURITY_DEGRADED" == "true" ]]; then
     log "WARN" "[STARTUP] Agent v$AGENT_VERSION starting in DEGRADED mode (SecurityDegraded=TRUE, only recovery jobs allowed)"
 else
     set_agent_state "ENFORCING" "Normal operation"
     log "SUCCESS" "[STARTUP] Agent v$AGENT_VERSION fully operational in ENFORCING state"
 fi
 
 last_heartbeat=$(date +%s)
 last_auto_repair=$(date +%s)
 last_job_poll=$(date +%s)
 last_dns_sync=$(date +%s)
 
 while true; do
     now=$(date +%s)
     
     # ============================================
     # NETWORK WATCHDOG
     # ============================================
     network_ok=false
     if test_network_connectivity; then
         network_ok=true
         if [[ $CONSECUTIVE_NETWORK_FAILURES -ge 3 && "$CURRENT_STATE" == "DEGRADED" ]]; then
             # v5.0.13-fix: Only restore ENFORCING if crypto is healthy
             if [[ "$SECURITY_DEGRADED" == "false" ]]; then
                 set_agent_state "ENFORCING" "Network restored"
             else
                 log "WARN" "[FSM] Network restored but SecurityDegraded=TRUE - staying DEGRADED"
             fi
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
         
         # v5.0.14-fix: Use process substitution instead of pipe to avoid subshell variable isolation
         while read -r job; do
             if [[ -n "$job" ]]; then
                 # v5.0.13-fix: When SecurityDegraded, only allow recovery jobs (fail-closed)
                 job_type=$(echo "$job" | jq -r '.type // .job_type // "unknown"' 2>/dev/null)
                 if [[ "$SECURITY_DEGRADED" == "true" ]]; then
                     case "$job_type" in
                         update_agent|force_update|reinstall_agent)
                             # Recovery jobs allowed
                             ;;
                         *)
                             log "WARN" "[SECURITY] BLOCKED job '$job_type' - SecurityDegraded=TRUE (only recovery jobs allowed)"
                             submit_job_result "$job" '{"success":false,"status":"failed","error_message":"Agent in SecurityDegraded mode - only recovery jobs accepted","exit_code":403}'
                             continue
                             ;;
                     esac
                 fi
                 
                 result=$(execute_job "$job")
                 submit_job_result "$job" "$result"
             fi
         done < <(echo "$jobs" | jq -c '.[]' 2>/dev/null)
         
         last_job_poll=$now
     fi
     
    # ============================================
    # v5.0.3: SERVICE HEALTH CHECK (every 5 min)
    # ============================================
    service_health=$(assert_service_health)
    if echo "$service_health" | jq -e '.repaired == true' &>/dev/null; then
        repair_action=$(echo "$service_health" | jq -r '.repair_action')
        log "INFO" "[MAIN-LOOP] Service repaired: $repair_action"
    fi
    
    # ============================================
    # AUTO-REPAIR EVERY 5 MINUTES
    # ============================================
    if [[ $((now - last_auto_repair)) -ge 300 ]]; then
        # Disk cleanup
        disk_result=$(invoke_disk_cleanup)
        if echo "$disk_result" | jq -e '.cleaned == true' &>/dev/null; then
            freed=$(echo "$disk_result" | jq -r '.freed_percent')
            log "SUCCESS" "[AUTO-REPAIR] Disk cleanup freed ${freed}%"
        fi
        
        # High CPU process check
        cpu_result=$(invoke_high_cpu_process_check)
        killed=$(echo "$cpu_result" | jq -r '.killed_count')
        if [[ "$killed" -gt 0 ]]; then
            log "SUCCESS" "[AUTO-REPAIR] Killed $killed high-CPU processes"
        fi
        
        last_auto_repair=$now
    fi
     
     # ============================================
     # HEARTBEAT EVERY INTERVAL
     # ============================================
     if [[ $((now - last_heartbeat)) -ge $POLL_INTERVAL && "$network_ok" == "true" ]]; then
         if ! send_heartbeat; then
             CONSECUTIVE_HEARTBEAT_FAILURES=$((CONSECUTIVE_HEARTBEAT_FAILURES + 1))
             log "WARN" "[HEARTBEAT] Failure #$CONSECUTIVE_HEARTBEAT_FAILURES"
             
             if [[ "$CURRENT_STATE" == "ENFORCING" ]]; then
                 set_agent_state "DEGRADED" "Heartbeat failed"
             fi
             
             # v5.0.13-fix: After 5 consecutive failures, enter SAFE_MODE (auth loop prevention)
             if [[ $CONSECUTIVE_HEARTBEAT_FAILURES -ge 5 ]]; then
                 log "ERROR" "[SECURITY] $CONSECUTIVE_HEARTBEAT_FAILURES consecutive heartbeat failures - entering SAFE_MODE"
                 set_agent_state "SAFE_MODE" "Persistent auth failure ($CONSECUTIVE_HEARTBEAT_FAILURES consecutive)"
                 
                 # Backoff loop in SAFE_MODE - try every 2 minutes, max 10 attempts
                 safe_mode_attempt=0
                 while [[ "$CURRENT_STATE" == "SAFE_MODE" && $safe_mode_attempt -lt 10 ]]; do
                     safe_mode_attempt=$((safe_mode_attempt + 1))
                     log "INFO" "[SAFE_MODE] Recovery attempt $safe_mode_attempt/10 - waiting 120s..."
                     sleep 120
                     if send_heartbeat; then
                         CONSECUTIVE_HEARTBEAT_FAILURES=0
                         if [[ "$SECURITY_DEGRADED" == "false" ]]; then
                             set_agent_state "ENFORCING" "Heartbeat recovered"
                         else
                             set_agent_state "DEGRADED" "Heartbeat recovered but SecurityDegraded"
                         fi
                         log "SUCCESS" "[SAFE_MODE] Recovery successful after $safe_mode_attempt attempts"
                         break
                     fi
                 done
             fi
         else
             if [[ $CONSECUTIVE_HEARTBEAT_FAILURES -gt 0 ]]; then
                 log "SUCCESS" "[HEARTBEAT] Recovered after $CONSECUTIVE_HEARTBEAT_FAILURES failures"
             fi
             CONSECUTIVE_HEARTBEAT_FAILURES=0
         fi
         last_heartbeat=$now
     fi
     
     # ============================================
     # DNS BLOCKLIST SYNC (1x per hour)
     # ============================================
     if [[ $((now - last_dns_sync)) -ge 3600 && "$network_ok" == "true" ]]; then
         sync_dns_blocklist || true
         last_dns_sync=$now
     fi
     
     # v5.0.13-perf: Dynamic sleep interval based on agent state
     base_sleep=2
     case "$CURRENT_STATE" in
         "ENFORCING") base_sleep=2 ;;
         "DEGRADED")  base_sleep=5 ;;
         "SAFE_MODE") base_sleep=10 ;;
         *)           base_sleep=2 ;;
     esac
     
     # v5.0.13-perf: Adaptive CPU protection - increase sleep under high load
     cpu_load=$(awk '{print int($1 * 100)}' /proc/loadavg 2>/dev/null || echo 0)
     nproc_count=$(nproc 2>/dev/null || echo 1)
     cpu_percent=$((cpu_load / nproc_count))
     if [[ $cpu_percent -gt 80 ]]; then
         base_sleep=$((base_sleep > 10 ? base_sleep : 10))
     fi
     
     sleep "$base_sleep"
     
     # v5.0.13-perf: Flush log buffer on each cycle boundary
     flush_log_buffer
 done