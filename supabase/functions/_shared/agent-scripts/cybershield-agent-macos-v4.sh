#!/usr/bin/env bash
#
# CyberShield Agent - macOS v4.0.7
#
# FASE 2.1: State Machine Formal (6 estados)
# FASE 2.2: Evidence Journal Local
# FASE 2.4: DNS Filter Integration
# FASE 2.5: Policy Contract (Desired vs Actual + Drift Detection)
#
# Estados:
# - BOOTSTRAP: Inicializacao do agente
# - SYNCING: Sincronizando com servidor
# - ENFORCING: Operacao normal, executando jobs
# - DEGRADED: Erro nao-critico, funcionando parcialmente
# - ERROR: Erro critico, requer intervencao
# - RECOVERY: Tentando auto-recuperacao
#
# Uso:
#   ./cybershield-agent-macos-v4.sh \
#       --server-url "https://seu-projeto.supabase.co" \
#       --agent-token "AGENT_TOKEN_AQUI" \
#       --hmac-secret "64_HEX_CHARS_AQUI" \
#       --agent-name "meu-mac-01"
#

set -euo pipefail

# ============================================
#  CONSTANTES E VARIAVEIS GLOBAIS
# ============================================
AGENT_VERSION="v4.0.8"
BASE_DIR="/Library/Application Support/CyberShield"
LOG_DIR="${BASE_DIR}/logs"
EVIDENCE_DIR="${BASE_DIR}/evidence"
CONFIG_DIR="${BASE_DIR}/config"
LOG_FILE="${LOG_DIR}/agent.log"
EVIDENCE_FILE="${EVIDENCE_DIR}/journal.log"
POLL_INTERVAL=60

# State Machine
declare -A AGENT_STATE=(
    [current]="BOOTSTRAP"
    [previous]=""
    [error_count]=0
    [recovery_attempts]=0
    [last_state_change]=""
)

# Valid states and transitions
declare -a VALID_STATES=("BOOTSTRAP" "SYNCING" "ENFORCING" "DEGRADED" "ERROR" "RECOVERY")
declare -A STATE_TRANSITIONS=(
    ["BOOTSTRAP"]="SYNCING ERROR"
    ["SYNCING"]="ENFORCING DEGRADED ERROR"
    ["ENFORCING"]="DEGRADED ERROR SYNCING"
    ["DEGRADED"]="RECOVERY ERROR ENFORCING"
    ["RECOVERY"]="ENFORCING DEGRADED ERROR"
    ["ERROR"]="RECOVERY"
)
JOB_EXECUTION_STATES="ENFORCING DEGRADED"

# DNS Filter Config
DNS_FILTER_ENABLED=true
DNS_FILTER_PLIST="/Library/LaunchDaemons/com.cybershield.dns.plist"
DNS_FILTER_BINARY="${BASE_DIR}/dns-filter/cybershield-dns"
DNS_CONSECUTIVE_FAILURES=0

# Policy Contract
POLICY_VERSION="2025-01"
declare -A POLICY_EXPECTED=(
    [dns_enabled]="true"
    [dns_service_running]="true"
    [agent_min_version]="v4.0.0"
    [blocked_domains_synced]="true"
    [heartbeat_interval_max]="300"
    [job_execution_enabled]="true"
)

# Evidence Buffer
declare -a EVIDENCE_BUFFER=()
EVIDENCE_FLUSH_THRESHOLD=10

# ============================================
#  PARSING DE ARGUMENTOS
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

# ============================================
#  CRIAR DIRETORIOS
# ============================================
mkdir -p "$LOG_DIR" "$EVIDENCE_DIR" "$CONFIG_DIR"

# ============================================
#  LOGGING
# ============================================
log() {
    local level="${1:-INFO}"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local state="${AGENT_STATE[current]}"
    local line="[$timestamp] [$level] [$state] $message"
    
    echo "$line"
    echo "$line" >> "$LOG_FILE"
}

# ============================================
#  FASE 2.1: STATE MACHINE
# ============================================
set_state() {
    local new_state="$1"
    local reason="$2"
    local error_details="${3:-}"
    local current_state="${AGENT_STATE[current]}"
    
    # Validate transition
    if [[ "$current_state" != "$new_state" ]]; then
        local allowed="${STATE_TRANSITIONS[$current_state]}"
        if [[ ! " $allowed " =~ " $new_state " ]]; then
            log "WARN" "[STATE] INVALID TRANSITION: $current_state -> $new_state (allowed: $allowed)"
            add_evidence "state_change" "{\"attempted_from\":\"$current_state\",\"attempted_to\":\"$new_state\",\"blocked\":true}" "$current_state" "$current_state" "warning"
            return 1
        fi
    fi
    
    # Apply transition
    AGENT_STATE[previous]="$current_state"
    AGENT_STATE[current]="$new_state"
    AGENT_STATE[last_state_change]=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Reset counters on success
    if [[ "$new_state" == "ENFORCING" ]]; then
        AGENT_STATE[error_count]=0
        AGENT_STATE[recovery_attempts]=0
    fi
    
    # Increment error count
    if [[ "$new_state" == "ERROR" || "$new_state" == "DEGRADED" ]]; then
        ((AGENT_STATE[error_count]++))
    fi
    
    log "INFO" "[STATE] $current_state -> $new_state ($reason)"
    
    # Record evidence
    local severity="info"
    [[ "$new_state" == "ERROR" ]] && severity="error"
    [[ "$new_state" == "DEGRADED" ]] && severity="warning"
    
    add_evidence "state_change" "{\"from\":\"$current_state\",\"to\":\"$new_state\",\"reason\":\"$reason\",\"error_details\":\"$error_details\"}" "$current_state" "$new_state" "$severity"
    
    return 0
}

get_state() {
    echo "${AGENT_STATE[current]}"
}

can_execute_job() {
    local state
    state=$(get_state)
    [[ " $JOB_EXECUTION_STATES " =~ " $state " ]]
}

# ============================================
#  FASE 2.2: EVIDENCE JOURNAL
# ============================================
add_evidence() {
    local type="$1"
    local data="$2"
    local state_before="${3:-}"
    local state_after="${4:-}"
    local severity="${5:-info}"
    
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Calculate SHA256 hash
    local evidence_hash
    evidence_hash=$(echo -n "$data" | shasum -a 256 | cut -d' ' -f1)
    
    local entry
    entry=$(cat <<EOF
{"timestamp":"$timestamp","type":"$type","agent_name":"$AGENT_NAME","agent_version":"$AGENT_VERSION","state_before":"$state_before","state_after":"$state_after","severity":"$severity","data":$data,"evidence_hash":"$evidence_hash"}
EOF
)
    
    # Write to local journal
    echo "$entry" >> "$EVIDENCE_FILE"
    
    # Add to buffer
    EVIDENCE_BUFFER+=("$entry")
    
    # Flush if threshold reached
    if [[ ${#EVIDENCE_BUFFER[@]} -ge $EVIDENCE_FLUSH_THRESHOLD ]]; then
        flush_evidence
    fi
}

flush_evidence() {
    if [[ ${#EVIDENCE_BUFFER[@]} -eq 0 ]]; then
        return
    fi
    
    log "DEBUG" "[EVIDENCE] Flushing ${#EVIDENCE_BUFFER[@]} entries to server"
    
    # Build entries array (simplified for macOS without jq dependency issues)
    local entries="["
    local first=true
    for entry in "${EVIDENCE_BUFFER[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            entries+=","
        fi
        entries+="$entry"
    done
    entries+="]"
    
    local body
    body="{\"agent_name\":\"$AGENT_NAME\",\"agent_version\":\"$AGENT_VERSION\",\"entries\":$entries}"
    
    if invoke_secure_request "POST" "/functions/v1/submit-agent-evidence" "$body" 30; then
        log "DEBUG" "[EVIDENCE] Flushed successfully"
        EVIDENCE_BUFFER=()
    else
        log "WARN" "[EVIDENCE] Flush failed, keeping in buffer"
    fi
}

rotate_evidence() {
    local max_size_mb=50
    local max_age_days=7
    
    if [[ -f "$EVIDENCE_FILE" ]]; then
        local size
        size=$(stat -f%z "$EVIDENCE_FILE" 2>/dev/null || echo 0)
        local max_bytes=$((max_size_mb * 1024 * 1024))
        
        if [[ $size -gt $max_bytes ]]; then
            local archive="${EVIDENCE_FILE}.$(date +%Y%m%d-%H%M%S).bak"
            mv "$EVIDENCE_FILE" "$archive"
            log "INFO" "[EVIDENCE] Journal rotated to $archive"
        fi
    fi
    
    # Clean old archives
    find "$EVIDENCE_DIR" -name "journal.log.*.bak" -mtime +$max_age_days -delete 2>/dev/null || true
}

# ============================================
#  AUTO-RECOVERY COM BACKOFF
# ============================================
invoke_auto_recovery() {
    local failed_component="$1"
    local error_message="${2:-}"
    local max_attempts=3
    
    if [[ ${AGENT_STATE[recovery_attempts]} -ge $max_attempts ]]; then
        log "ERROR" "[RECOVERY] Max attempts ($max_attempts) exceeded for $failed_component"
        set_state "ERROR" "Max recovery attempts exceeded" "Component: $failed_component, Last error: $error_message"
        add_evidence "auto_recovery" "{\"component\":\"$failed_component\",\"success\":false,\"reason\":\"max_attempts_exceeded\"}" "" "" "critical"
        return 1
    fi
    
    ((AGENT_STATE[recovery_attempts]++))
    local attempt=${AGENT_STATE[recovery_attempts]}
    
    # Exponential backoff: 5s, 10s, 20s
    local backoff=$((5 * (2 ** (attempt - 1))))
    
    log "WARN" "[RECOVERY] Attempt $attempt/$max_attempts for $failed_component (backoff: ${backoff}s)"
    set_state "RECOVERY" "Auto-recovery: $failed_component (attempt $attempt)"
    
    add_evidence "auto_recovery" "{\"component\":\"$failed_component\",\"attempt\":$attempt,\"backoff_seconds\":$backoff}" "" "" "warning"
    
    sleep $backoff
    
    # Try to recover
    local recovered=false
    case "$failed_component" in
        "heartbeat")
            if send_heartbeat; then
                recovered=true
            fi
            ;;
        "dns_filter")
            if invoke_dns_recovery; then
                recovered=true
            fi
            ;;
        "network")
            if ping -c 1 google.com &>/dev/null; then
                recovered=true
            fi
            ;;
        *)
            if send_heartbeat; then
                recovered=true
            fi
            ;;
    esac
    
    if [[ "$recovered" == "true" ]]; then
        log "SUCCESS" "[RECOVERY] Success for $failed_component on attempt $attempt"
        set_state "ENFORCING" "Recovery successful: $failed_component"
        AGENT_STATE[recovery_attempts]=0
        add_evidence "auto_recovery" "{\"component\":\"$failed_component\",\"attempt\":$attempt,\"success\":true}" "" "" "info"
        return 0
    fi
    
    log "WARN" "[RECOVERY] Failed for $failed_component on attempt $attempt"
    set_state "DEGRADED" "Recovery attempt $attempt failed: $failed_component"
    return 1
}

# ============================================
#  FASE 2.4: DNS FILTER INTEGRATION (macOS)
# ============================================
get_dns_status() {
    local installed=false
    local running=false
    local status="unknown"
    
    if [[ -f "$DNS_FILTER_PLIST" ]]; then
        installed=true
        if launchctl list | grep -q "com.cybershield.dns"; then
            running=true
            status="running"
        else
            status="stopped"
        fi
    fi
    
    echo "{\"installed\":$installed,\"running\":$running,\"status\":\"$status\",\"exe_exists\":$(test -f "$DNS_FILTER_BINARY" && echo true || echo false)}"
}

start_dns_service() {
    if [[ ! -f "$DNS_FILTER_BINARY" ]]; then
        log "WARN" "[DNS] Binary not found at $DNS_FILTER_BINARY"
        return 1
    fi
    
    if [[ ! -f "$DNS_FILTER_PLIST" ]]; then
        log "INFO" "[DNS] Creating LaunchDaemon..."
        cat > "$DNS_FILTER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.dns</string>
    <key>ProgramArguments</key>
    <array>
        <string>$DNS_FILTER_BINARY</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/dns.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/dns-error.log</string>
</dict>
</plist>
EOF
    fi
    
    log "INFO" "[DNS] Starting DNS Filter service..."
    launchctl load -w "$DNS_FILTER_PLIST" 2>/dev/null || true
    sleep 2
    
    if launchctl list | grep -q "com.cybershield.dns"; then
        log "SUCCESS" "[DNS] Service started successfully"
        DNS_CONSECUTIVE_FAILURES=0
        add_evidence "dns_block" "{\"action\":\"service_started\",\"service\":\"com.cybershield.dns\"}" "" "" "info"
        return 0
    else
        log "ERROR" "[DNS] Service failed to start"
        return 1
    fi
}

stop_dns_service() {
    if [[ -f "$DNS_FILTER_PLIST" ]]; then
        log "INFO" "[DNS] Stopping DNS Filter service..."
        launchctl unload "$DNS_FILTER_PLIST" 2>/dev/null || true
        add_evidence "dns_block" "{\"action\":\"service_stopped\",\"service\":\"com.cybershield.dns\"}" "" "" "info"
    fi
    return 0
}

test_dns_health() {
    if ! launchctl list | grep -q "com.cybershield.dns" 2>/dev/null; then
        ((DNS_CONSECUTIVE_FAILURES++))
        echo "{\"healthy\":false,\"reason\":\"Service not running\",\"consecutive_failures\":$DNS_CONSECUTIVE_FAILURES}"
        return 1
    fi
    
    # Test DNS resolution via local resolver
    if dig @127.0.0.1 google.com +short +time=2 &>/dev/null; then
        DNS_CONSECUTIVE_FAILURES=0
        echo "{\"healthy\":true,\"reason\":\"DNS resolution OK\",\"consecutive_failures\":0}"
        return 0
    else
        ((DNS_CONSECUTIVE_FAILURES++))
        echo "{\"healthy\":false,\"reason\":\"DNS resolution failed\",\"consecutive_failures\":$DNS_CONSECUTIVE_FAILURES}"
        return 1
    fi
}

invoke_dns_recovery() {
    log "WARN" "[DNS] Attempting DNS Filter recovery..."
    add_evidence "auto_recovery" "{\"component\":\"dns_filter\",\"consecutive_failures\":$DNS_CONSECUTIVE_FAILURES}" "" "" "warning"
    
    stop_dns_service
    sleep 2
    
    if start_dns_service; then
        if test_dns_health &>/dev/null; then
            log "SUCCESS" "[DNS] Recovery successful"
            add_evidence "auto_recovery" "{\"component\":\"dns_filter\",\"success\":true}" "" "" "info"
            return 0
        fi
    fi
    
    log "ERROR" "[DNS] Recovery failed"
    add_evidence "auto_recovery" "{\"component\":\"dns_filter\",\"success\":false}" "" "" "error"
    return 1
}

configure_system_dns() {
    # Configure macOS to use local DNS resolver
    local primary_service
    primary_service=$(networksetup -listnetworkserviceorder | grep -A 1 "Hardware Port" | grep -v "Hardware Port" | head -1 | sed 's/^.*Device: //' | tr -d ')')
    
    if [[ -n "$primary_service" ]]; then
        local service_name
        service_name=$(networksetup -listallnetworkservices | grep -v "^\*" | head -1)
        if [[ -n "$service_name" ]]; then
            log "INFO" "[DNS] Configuring system DNS to use local resolver"
            networksetup -setdnsservers "$service_name" 127.0.0.1
            dscacheutil -flushcache
            killall -HUP mDNSResponder 2>/dev/null || true
        fi
    fi
}

# ============================================
#  FASE 2.5: POLICY CONTRACT
# ============================================
get_current_policy_state() {
    local dns_status
    dns_status=$(get_dns_status)
    local dns_running
    dns_running=$(echo "$dns_status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('running', False))" 2>/dev/null || echo "false")
    local dns_installed
    dns_installed=$(echo "$dns_status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('installed', False))" 2>/dev/null || echo "false")
    local agent_state
    agent_state=$(get_state)
    local can_execute
    can_execute_job && can_execute="true" || can_execute="false"
    local blocked_synced
    blocked_synced=$(test -f "${BASE_DIR}/blocked_websites.json" && echo "true" || echo "false")
    
    cat <<EOF
{"dns_enabled":"$DNS_FILTER_ENABLED","dns_service_running":"$dns_running","dns_installed":"$dns_installed","agent_version":"$AGENT_VERSION","agent_state":"$agent_state","job_execution_enabled":"$can_execute","heartbeat_interval":"$POLL_INTERVAL","blocked_domains_synced":"$blocked_synced","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
}

check_policy_compliance() {
    local current
    current=$(get_current_policy_state)
    local drift_count=0
    
    # Check DNS running (using Python for JSON parsing on macOS)
    local actual_dns
    actual_dns=$(echo "$current" | python3 -c "import sys,json; print(json.load(sys.stdin).get('dns_service_running', 'false'))" 2>/dev/null || echo "false")
    if [[ "${POLICY_EXPECTED[dns_service_running]}" == "true" && "$actual_dns" != "true" && "$actual_dns" != "True" ]]; then
        ((drift_count++))
        log "WARN" "[POLICY] Drift: dns_service_running expected=true actual=$actual_dns"
    fi
    
    if [[ $drift_count -gt 0 ]]; then
        log "WARN" "[POLICY] Drift detected: $drift_count issue(s)"
        add_evidence "policy_drift" "{\"drift_count\":$drift_count,\"current\":$current}" "" "" "warning"
        echo "{\"compliant\":false,\"drift_count\":$drift_count}"
        return 1
    fi
    
    log "DEBUG" "[POLICY] Compliance check passed"
    echo "{\"compliant\":true,\"drift_count\":0}"
    return 0
}

invoke_policy_enforcement() {
    local compliance
    compliance=$(check_policy_compliance)
    
    if echo "$compliance" | grep -q '"compliant":true'; then
        return 0
    fi
    
    log "INFO" "[POLICY] Attempting to enforce policy..."
    
    # Enforce DNS if needed
    local current
    current=$(get_current_policy_state)
    local actual_dns
    actual_dns=$(echo "$current" | python3 -c "import sys,json; print(json.load(sys.stdin).get('dns_service_running', 'false'))" 2>/dev/null || echo "false")
    
    if [[ "${POLICY_EXPECTED[dns_service_running]}" == "true" && "$actual_dns" != "true" ]]; then
        log "INFO" "[POLICY] Enforcing: Starting DNS service"
        start_dns_service || true
    fi
    
    add_evidence "policy_sync" "{\"action\":\"enforcement_complete\"}" "" "" "info"
    return 0
}

sync_policy_from_server() {
    log "INFO" "[POLICY] Syncing policy from server..."
    
    local body
    body="{\"agent_name\":\"$AGENT_NAME\",\"agent_version\":\"$AGENT_VERSION\"}"
    
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/get-agent-policy" "$body" 15)
    
    if [[ $? -eq 0 && -n "$result" ]]; then
        local server_version
        server_version=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version', ''))" 2>/dev/null || echo "")
        if [[ -n "$server_version" ]]; then
            POLICY_VERSION="$server_version"
            log "SUCCESS" "[POLICY] Policy synced from server (version: $server_version)"
            add_evidence "policy_sync" "{\"action\":\"synced_from_server\",\"version\":\"$server_version\"}" "" "" "info"
            return 0
        fi
    fi
    
    log "WARN" "[POLICY] Server policy not available, using defaults"
    return 1
}

# ============================================
#  HMAC SIGNATURE
# ============================================
get_hmac_signature() {
    local message="$1"
    local secret="$2"
    
    # Convert hex secret to binary and compute HMAC
    echo -n "$message" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$secret" | awk '{print $2}'
}

# ============================================
#  SECURE REQUEST
# ============================================
invoke_secure_request() {
    local method="$1"
    local path="$2"
    local body="${3:-}"
    local timeout="${4:-30}"
    
    local uri="${SERVER_URL}${path}"
    local timestamp
    timestamp=$(python3 -c "import time; print(int(time.time() * 1000))")
    local nonce
    nonce=$(uuidgen | tr '[:upper:]' '[:lower:]')
    
    local payload="${timestamp}:${nonce}:${body}"
    local signature
    signature=$(get_hmac_signature "$payload" "$HMAC_SECRET")
    
    local response
    local http_code
    
    if [[ -n "$body" ]]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$uri" \
            -H "Content-Type: application/json" \
            -H "X-Agent-Token: $AGENT_TOKEN" \
            -H "X-HMAC-Signature: $signature" \
            -H "X-Timestamp: $timestamp" \
            -H "X-Nonce: $nonce" \
            -d "$body" \
            --connect-timeout "$timeout" \
            --max-time "$timeout" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$uri" \
            -H "Content-Type: application/json" \
            -H "X-Agent-Token: $AGENT_TOKEN" \
            -H "X-HMAC-Signature: $signature" \
            -H "X-Timestamp: $timestamp" \
            -H "X-Nonce: $nonce" \
            --connect-timeout "$timeout" \
            --max-time "$timeout" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    local body_response
    body_response=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" == "200" ]]; then
        echo "$body_response"
        return 0
    else
        log "ERROR" "[NETWORK] $method $path failed with status $http_code"
        return 1
    fi
}

# ============================================
#  HEARTBEAT
# ============================================
send_heartbeat() {
    local os_version
    os_version=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
    
    local body
    body=$(cat <<EOF
{"agent_name":"$AGENT_NAME","hostname":"$(hostname)","os_type":"macos","os_version":"$os_version","agent_version":"$AGENT_VERSION","state":"$(get_state)","error_count":${AGENT_STATE[error_count]}}
EOF
)
    
    log "INFO" "[HEARTBEAT] Sending heartbeat (state: $(get_state))..."
    
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/heartbeat" "$body" 15)
    
    if [[ $? -eq 0 ]]; then
        log "SUCCESS" "[HEARTBEAT] OK (200)"
        add_evidence "heartbeat" "{\"status\":\"success\",\"state\":\"$(get_state)\"}" "" "" "debug"
        return 0
    else
        log "ERROR" "[HEARTBEAT] Failed"
        return 1
    fi
}

# ============================================
#  POLL JOBS
# ============================================
poll_jobs() {
    local body
    body="{\"agent_name\":\"$AGENT_NAME\",\"agent_version\":\"$AGENT_VERSION\",\"state\":\"$(get_state)\"}"
    
    log "INFO" "Polling jobs..."
    
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/poll-jobs" "$body" 20)
    
    if [[ $? -ne 0 || -z "$result" ]]; then
        return 1
    fi
    
    # v5.0.12 FIX: Backend may return wrapped {jobs:[...]} or flat array [...]
    local jobs_data
    jobs_data=$(echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if isinstance(data, dict) and 'jobs' in data:
    print(json.dumps(data['jobs']))
elif isinstance(data, list):
    print(json.dumps(data))
else:
    print('[]')
" 2>/dev/null || echo "[]")
    
    local job_count
    job_count=$(echo "$jobs_data" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    
    if [[ "$job_count" == "0" ]]; then
        log "DEBUG" "[POLL] No jobs available"
        return 0
    fi
    
    log "INFO" "[JOBS] Received $job_count job(s)"
    
    # Process each job
    for i in $(seq 0 $((job_count - 1))); do
        local job
        job=$(echo "$jobs_data" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)[$i]))" 2>/dev/null)
        if [[ -n "$job" ]]; then
            execute_job "$job"
        fi
    done
}

# ============================================
#  EXECUTE JOB
# ============================================
execute_job() {
    local job="$1"
    
    if ! can_execute_job; then
        local state
        state=$(get_state)
        log "WARN" "[JOB] Cannot execute job in state $state"
        return 1
    fi
    
    local job_id
    job_id=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
    local job_type
    job_type=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type', ''))" 2>/dev/null)
    local execution_id="exec-$(uuidgen | tr '[:upper:]' '[:lower:]')"
    local start_time
    start_time=$(date +%s)
    
    log "INFO" "[JOB] Executing job $job_id (type=$job_type, exec_id=$execution_id)"
    
    add_evidence "job_execution" "{\"job_id\":\"$job_id\",\"job_type\":\"$job_type\",\"execution_id\":\"$execution_id\",\"phase\":\"started\"}" "" "" "info"
    
    local output=""
    local status="completed"
    local error_message=""
    
    case "$job_type" in
        "report")
            output=$(collect_system_metrics)
            ;;
        "software_inventory_collect")
            output=$(collect_software_inventory)
            ;;
        "collect_antivirus_status")
            output=$(collect_antivirus_status)
            ;;
        "collect_web_activity")
            output=$(collect_web_activity)
            ;;
        *)
            status="failed"
            error_message="Unsupported job type: $job_type"
            ;;
    esac
    
    local end_time
    end_time=$(date +%s)
    local exec_time=$((end_time - start_time))
    
    add_evidence "job_execution" "{\"job_id\":\"$job_id\",\"job_type\":\"$job_type\",\"execution_id\":\"$execution_id\",\"phase\":\"$status\",\"execution_time_seconds\":$exec_time}" "" "" "info"
    
    submit_job_result "$job_id" "$status" "$output" "$error_message" "$exec_time" "$execution_id"
}

submit_job_result() {
    local job_id="$1"
    local status="$2"
    local output="$3"
    local error_message="$4"
    local exec_time="$5"
    local execution_id="$6"
    
    local body
    body=$(cat <<EOF
{"job_id":"$job_id","status":"$status","output":$output,"error_message":"$error_message","execution_time_seconds":$exec_time,"agent_name":"$AGENT_NAME","agent_version":"$AGENT_VERSION","execution_id":"$execution_id"}
EOF
)
    
    log "INFO" "[JOB] Submitting result for job $job_id (status=$status)"
    invoke_secure_request "POST" "/functions/v1/submit-job-result" "$body" 30
}

# ============================================
#  JOB HANDLERS
# ============================================
collect_system_metrics() {
    local cpu_usage
    cpu_usage=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | tr -d '%')
    local mem_info
    mem_info=$(vm_stat | awk '/Pages active/ {print $3}' | tr -d '.')
    local disk_usage
    disk_usage=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
    local uptime_seconds
    uptime_seconds=$(sysctl -n kern.boottime | awk '{print $4}' | tr -d ',')
    local now
    now=$(date +%s)
    uptime_seconds=$((now - uptime_seconds))
    
    cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","hostname":"$(hostname)","cpu_percent":${cpu_usage:-0},"memory_percent":${mem_info:-0},"disk_percent":${disk_usage:-0},"uptime_seconds":${uptime_seconds:-0},"state":"$(get_state)"}
EOF
}

collect_software_inventory() {
    local packages="[]"
    
    # Get installed applications from /Applications
    local apps
    apps=$(ls -1 /Applications 2>/dev/null | grep "\.app$" | head -100 | while read app; do
        local name="${app%.app}"
        echo "{\"name\":\"$name\",\"version\":\"unknown\",\"publisher\":\"unknown\"}"
    done | tr '\n' ',' | sed 's/,$//')
    
    [[ -n "$apps" ]] && packages="[$apps]"
    
    local count
    count=$(echo "$packages" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    
    cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","hostname":"$(hostname)","software_count":$count,"software":$packages}
EOF
}

collect_antivirus_status() {
    local engines="[]"
    
    # Check XProtect (built-in macOS malware protection)
    if [[ -d "/System/Library/CoreServices/XProtect.bundle" ]]; then
        local version
        version=$(defaults read /System/Library/CoreServices/XProtect.bundle/Contents/Info CFBundleShortVersionString 2>/dev/null || echo "unknown")
        engines="[{\"name\":\"XProtect\",\"version\":\"$version\",\"enabled\":true}]"
    fi
    
    cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","hostname":"$(hostname)","engines":$engines}
EOF
}

collect_web_activity() {
    cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","hostname":"$(hostname)","dns_cache":[],"browser_history":[]}
EOF
}

# ============================================
#  LOG ROTATION
# ============================================
rotate_logs() {
    local max_size_mb=10
    local max_age_days=7
    
    if [[ -f "$LOG_FILE" ]]; then
        local size
        size=$(stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
        local max_bytes=$((max_size_mb * 1024 * 1024))
        
        if [[ $size -gt $max_bytes ]]; then
            local archive="${LOG_FILE}.$(date +%Y%m%d-%H%M%S).bak"
            mv "$LOG_FILE" "$archive"
            log "INFO" "[LOG] Rotated to $archive"
        fi
    fi
    
    find "$LOG_DIR" -name "*.bak" -mtime +$max_age_days -delete 2>/dev/null || true
}

# ============================================
#  MAIN LOOP
# ============================================
log "INFO" "============================================"
log "INFO" "[START] CyberShield Agent v4.0.1 - macOS"
log "INFO" "[INFO] ServerUrl: $SERVER_URL"
log "INFO" "[INFO] AgentName: $AGENT_NAME"
log "INFO" "============================================"

add_evidence "state_change" "{\"event\":\"agent_started\",\"version\":\"$AGENT_VERSION\",\"hostname\":\"$(hostname)\",\"features\":[\"state_machine\",\"evidence_journal\",\"dns_filter\",\"policy_contract\"]}" "" "BOOTSTRAP" "info"

# Bootstrap
set_state "SYNCING" "Starting initial sync"

# Sync policy from server
sync_policy_from_server || true

# Start DNS if enabled
if [[ "$DNS_FILTER_ENABLED" == "true" && -f "$DNS_FILTER_BINARY" ]]; then
    log "INFO" "[BOOTSTRAP] Initializing DNS Filter..."
    start_dns_service || true
fi

# First heartbeat
if send_heartbeat; then
    set_state "ENFORCING" "Initial heartbeat successful"
else
    set_state "DEGRADED" "Initial heartbeat failed"
fi

# Initial compliance check
check_policy_compliance || invoke_policy_enforcement

log "SUCCESS" "[SUCCESS] Bootstrap completed (state: $(get_state))"

# Timing variables
last_heartbeat=$(date +%s)
last_poll=$(date +%s)
last_evidence_flush=$(date +%s)
last_rotation=$(date +%s)
last_dns_check=$(date +%s)
last_policy_check=$(date +%s)
last_policy_sync=$(date +%s)

# Main loop
while true; do
    now=$(date +%s)
    state=$(get_state)
    
    # Heartbeat
    if [[ $((now - last_heartbeat)) -ge $POLL_INTERVAL ]]; then
        if ! send_heartbeat; then
            if [[ "$state" == "ENFORCING" ]]; then
                invoke_auto_recovery "heartbeat" "Heartbeat failed"
            fi
        elif [[ "$state" == "DEGRADED" ]]; then
            set_state "ENFORCING" "Heartbeat recovered"
        fi
        last_heartbeat=$now
    fi
    
    # Poll jobs
    if [[ $((now - last_poll)) -ge $POLL_INTERVAL ]]; then
        if can_execute_job; then
            poll_jobs || true
        fi
        last_poll=$now
    fi
    
    # DNS health check (every 2 minutes)
    if [[ "$DNS_FILTER_ENABLED" == "true" && $((now - last_dns_check)) -ge 120 ]]; then
        if ! test_dns_health &>/dev/null; then
            if [[ $DNS_CONSECUTIVE_FAILURES -ge 3 ]]; then
                invoke_auto_recovery "dns_filter" "DNS health check failed"
            fi
        fi
        last_dns_check=$now
    fi
    
    # Policy check (every 5 minutes)
    if [[ $((now - last_policy_check)) -ge 300 ]]; then
        check_policy_compliance || invoke_policy_enforcement
        last_policy_check=$now
    fi
    
    # Policy sync (every 30 minutes)
    if [[ $((now - last_policy_sync)) -ge 1800 ]]; then
        sync_policy_from_server || true
        last_policy_sync=$now
    fi
    
    # Evidence flush (every 5 minutes)
    if [[ $((now - last_evidence_flush)) -ge 300 ]]; then
        flush_evidence
        last_evidence_flush=$now
    fi
    
    # Log rotation (every hour)
    if [[ $((now - last_rotation)) -ge 3600 ]]; then
        rotate_logs
        rotate_evidence
        last_rotation=$now
    fi
    
    sleep 2
done
