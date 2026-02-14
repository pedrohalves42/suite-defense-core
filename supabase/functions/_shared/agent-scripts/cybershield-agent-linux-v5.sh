#!/usr/bin/env bash
#
# CyberShield Agent - Linux v5.0.3
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
AGENT_VERSION="v5.0.3"
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
 #  LOGGING
 # ============================================
 log() {
     local level="${1:-INFO}"
     local message="$2"
     local timestamp
     timestamp=$(date '+%Y-%m-%d %H:%M:%S')
     local line="[$timestamp] [$level] [$CURRENT_STATE] $message"
     
     echo "$line"
     echo "$line" >> "$LOG_FILE"
     
     # Log rotation (keep 10MB max)
     local log_size
     log_size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
     if [[ $log_size -gt 10485760 ]]; then
         mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S).bak"
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
     
     # Backup previous key
     if [[ -f "$PRIVATE_KEY_PATH" ]]; then
         cp "$PRIVATE_KEY_PATH" "$PREVIOUS_KEY_PATH" 2>/dev/null || true
     fi
     
     # Generate private key
     openssl ecparam -genkey -name prime256v1 -noout -out "$PRIVATE_KEY_PATH" 2>/dev/null
     chmod 600 "$PRIVATE_KEY_PATH"
     
     # Extract public key
     openssl ec -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH" 2>/dev/null
     
     # Calculate fingerprint
     local fingerprint
     fingerprint=$(openssl dgst -sha256 -binary "$PUBLIC_KEY_PATH" | xxd -p | tr -d '\n')
     echo "$fingerprint" > "$FINGERPRINT_PATH"
     
     SIGNING_FINGERPRINT="$fingerprint"
     log "SUCCESS" "[KEYS] Keypair generated (fingerprint: ${fingerprint:0:16}...)"
     
     echo "$fingerprint"
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
        # v5.0.1: NEW - Process/Service Control Handlers
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
             
             # Check if in baseline
             local in_baseline=false
             for baseline_proc in "${PROCESS_BASELINE[@]}"; do
                 if [[ "$baseline_proc" == "$name" ]]; then
                     in_baseline=true
                     break
                 fi
             done
             
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
 initialize_process_baseline() {
     if [[ -f "$PROCESS_BASELINE_PATH" ]]; then
         mapfile -t PROCESS_BASELINE < <(jq -r '.[].name' "$PROCESS_BASELINE_PATH" 2>/dev/null)
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
         done
         baseline+=']'
         
         echo "$baseline" > "$PROCESS_BASELINE_PATH"
         log "SUCCESS" "[BASELINE] Created baseline with ${#PROCESS_BASELINE[@]} processes"
     fi
 }
 
 get_process_anomalies() {
     local current_procs
     mapfile -t current_procs < <(ps -eo comm= | sort -u)
     
     local anomalies='[]'
     local anomaly_count=0
     
     for proc in "${current_procs[@]}"; do
         local found=false
         for baseline_proc in "${PROCESS_BASELINE[@]}"; do
             if [[ "$proc" == "$baseline_proc" ]]; then
                 found=true
                 break
             fi
         done
         
         if [[ "$found" == "false" ]]; then
             anomaly_count=$((anomaly_count + 1))
             PROCESS_BASELINE+=("$proc")
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
     
     if [[ $? -eq 0 ]]; then
         log "SUCCESS" "[HEARTBEAT] Sent successfully"
         return 0
     else
         log "ERROR" "[HEARTBEAT] Failed"
         return 1
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
 if initialize_agent_keys; then
     keys_initialized=true
 else
     log "ERROR" "[STARTUP] Failed to initialize keys - entering DEGRADED mode"
 fi
 
 # ============================================
 #  PHASE 2: AUTHENTICATION
 # ============================================
 set_agent_state "AUTHENTICATING" "Validating credentials"
 
 # Send first heartbeat
 heartbeat_success=false
 if send_heartbeat; then
     heartbeat_success=true
     
     # Register public key
     if [[ "$keys_initialized" == "true" ]]; then
         register_agent_key || log "WARN" "[STARTUP] Key registration failed"
     fi
 else
     log "WARN" "[STARTUP] Initial heartbeat failed - entering DEGRADED mode"
     set_agent_state "DEGRADED" "Heartbeat failed"
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
 
 while true; do
     now=$(date +%s)
     
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
         echo "$jobs" | jq -c '.[]' 2>/dev/null | while read -r job; do
             if [[ -n "$job" ]]; then
                 result=$(execute_job "$job")
                 submit_job_result "$job" "$result"
             fi
         done
         
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
             if [[ "$CURRENT_STATE" == "ENFORCING" ]]; then
                 set_agent_state "DEGRADED" "Heartbeat failed"
             fi
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
     
     sleep 2
 done