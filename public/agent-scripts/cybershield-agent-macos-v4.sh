#!/usr/bin/env bash
#
# CyberShield Agent - macOS v4.2.1
#
# v4.2.1: SYNC com Windows - Paridade Completa
# - NEW: Coleta de historico de navegadores (Chrome, Firefox, Safari, Opera, Opera GX, Edge)
# - NEW: Bloqueio de sites via /etc/hosts
# - NEW: Proof of Execution (PoE) com ECDSA P-256
# - NEW: Force Update via Heartbeat Response
# - NEW: Auto-Rollback + Safe Mode
# - NEW: Deteccao de Full Disk Access para Safari
# - FIX: Normalizacao temporal correta para todos os browsers
# - FIX: Deduplicacao de entries com cache local
#
# FASE 2.1: State Machine Formal (6 estados)
# FASE 2.2: Evidence Journal Local
# FASE 2.4: DNS Filter Integration
# FASE 2.5: Policy Contract (Desired vs Actual + Drift Detection)
# SSA-004: Payload Signing - Verifies Ed25519 signatures on jobs
# PHASE 1: Process Control - kill_process, stop_service, disable_service, restart_service
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
AGENT_VERSION="v4.4.0"
BASE_DIR="/Library/Application Support/CyberShield"
LOG_DIR="${BASE_DIR}/logs"
EVIDENCE_DIR="${BASE_DIR}/evidence"
CONFIG_DIR="${BASE_DIR}/config"
KEYS_DIR="${BASE_DIR}/keys"
LOG_FILE="${LOG_DIR}/agent.log"
EVIDENCE_FILE="${EVIDENCE_DIR}/journal.log"
POLL_INTERVAL=60

# PoE - Proof of Execution (ECDSA P-256)
PRIVATE_KEY_PATH="${KEYS_DIR}/agent.key"
PUBLIC_KEY_PATH="${KEYS_DIR}/agent.pub"
FINGERPRINT_PATH="${KEYS_DIR}/fingerprint.txt"
PREVIOUS_KEY_PATH="${KEYS_DIR}/agent.key.prev"
SIGNING_FINGERPRINT=""

# Auto-Update + Rollback
ROLLBACK_STATE_FILE="${CONFIG_DIR}/rollback_state.json"
PREVIOUS_SCRIPT_PATH="${CONFIG_DIR}/agent_previous.sh"

# Web Activity
WEB_ACTIVITY_SEEN_FILE="${CONFIG_DIR}/web_activity_seen.cache"
BLOCKED_WEBSITES_FILE="${CONFIG_DIR}/blocked_websites.json"

# State Machine
declare -A AGENT_STATE=(
    [current]="BOOTSTRAP"
    [previous]=""
    [error_count]=0
    [recovery_attempts]=0
    [last_state_change]=""
)

# Valid states and transitions - FSM Enterprise v2.0
declare -a VALID_STATES=("BOOTSTRAP" "SYNCING" "ENFORCING" "DEGRADED" "ERROR" "RECOVERY" "SHUTDOWN")
declare -A STATE_TRANSITIONS=(
    ["BOOTSTRAP"]="SYNCING ERROR"
    ["SYNCING"]="ENFORCING DEGRADED ERROR"
    ["ENFORCING"]="DEGRADED ERROR SYNCING"
    ["DEGRADED"]="RECOVERY ERROR ENFORCING SHUTDOWN"
    ["RECOVERY"]="ENFORCING DEGRADED ERROR SHUTDOWN"
    ["ERROR"]="RECOVERY SHUTDOWN"
    ["SHUTDOWN"]=""  # Terminal - sem saídas permitidas
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
    [heartbeat_interval_max]="120"
    [job_execution_enabled]="true"
)

# Evidence Buffer
declare -a EVIDENCE_BUFFER=()
EVIDENCE_FLUSH_THRESHOLD=10

# SSA-004: Ed25519 Public Key for job signature verification
ED25519_PUBLIC_KEY="MCowBQYDK2VwAyEALE6FW6/R+acpFFZXw86DbfKQEtbYPVdABZih0iggaoI="
REQUIRE_JOB_SIGNATURES=true

# ============================================
#  FSM ENTERPRISE v2.0: FAILURE POLICY + OBSERVABILITY
# ============================================

# Failure Policy - Hard stops após limite
declare -A FAILURE_POLICY=(
    [max_recovery_attempts]=5
    [recovery_window_seconds]=300
    [cooldown_seconds]=600
    [max_consecutive_failures]=10
    [on_exhaust]="DEGRADED"
)

# Contadores por componente
declare -A FAILURE_COUNTERS

# Log Deduplication
declare -A LOG_DEDUP_CACHE
LOG_DEDUP_TTL=30

# write_log_dedup - Log com deduplicação automática
write_log_dedup() {
    local level="$1"
    local message="$2"
    local cache_key="${level}|${message}"
    local now
    now=$(date +%s)
    
    if [[ -n "${LOG_DEDUP_CACHE[$cache_key]:-}" ]]; then
        local last_log="${LOG_DEDUP_CACHE[$cache_key]}"
        local elapsed=$((now - last_log))
        if [[ $elapsed -lt $LOG_DEDUP_TTL ]]; then
            return  # Suprimir duplicado
        fi
    fi
    
    LOG_DEDUP_CACHE[$cache_key]=$now
    log "$level" "$message"
}

# add_component_failure - Registra falha com hard stop
add_component_failure() {
    local component="$1"
    local error_message="$2"
    local correlation_id="${3:-$(date +%s)}"
    
    if [[ -z "${FAILURE_COUNTERS[$component]:-}" ]]; then
        FAILURE_COUNTERS[$component]=0
    fi
    
    ((FAILURE_COUNTERS[$component]++))
    local count="${FAILURE_COUNTERS[$component]}"
    
    # Hard stop após max_consecutive_failures
    if [[ $count -ge ${FAILURE_POLICY[max_consecutive_failures]} ]]; then
        write_log_dedup "ERROR" "[CRITICAL] $component exceeded max failures ($count) - HARD STOP"
        
        add_evidence "recovery_exhausted" "{\"component\":\"$component\",\"consecutive_failures\":$count,\"action\":\"${FAILURE_POLICY[on_exhaust]}\",\"correlation_id\":\"$correlation_id\"}" "" "" "critical"
        
        set_state "${FAILURE_POLICY[on_exhaust]}" "Component $component exhausted after $count failures"
        
        echo "exhausted"
        return
    fi
    
    echo "retry:$count"
}

# reset_component_failure - Reseta contador após sucesso
reset_component_failure() {
    local component="$1"
    if [[ -n "${FAILURE_COUNTERS[$component]:-}" ]]; then
        FAILURE_COUNTERS[$component]=0
        write_log_dedup "DEBUG" "[FAILURE] $component counter reset"
    fi
}

# write_health_snapshot - Snapshot único por ciclo
write_health_snapshot() {
    local correlation_id="$1"
    local dns_status="unknown"
    
    if [[ "$DNS_FILTER_ENABLED" == "true" ]]; then
        if launchctl list | grep -q "com.cybershield.dns" 2>/dev/null; then
            dns_status="ok"
        else
            dns_status="failed"
        fi
    else
        dns_status="disabled"
    fi
    
    local snapshot="{\"state\":\"${AGENT_STATE[current]}\",\"components\":{\"dns_filter\":\"$dns_status\"},\"failure_counters\":{\"dns_filter\":${FAILURE_COUNTERS[dns_filter]:-0},\"heartbeat\":${FAILURE_COUNTERS[heartbeat]:-0}},\"correlation_id\":\"$correlation_id\"}"
    add_evidence "health_snapshot" "$snapshot" "" "" "info"
}

# write_incident_summary - Gera resumo de incidente
write_incident_summary() {
    local root_cause="$1"
    local correlation_id="$2"
    local incident_id
    incident_id=$(uuidgen 2>/dev/null || date +%s)
    
    local recommended_action="contact_support"
    if [[ "$root_cause" == *"dns"* ]]; then
        recommended_action="reinstall_dns_service"
    elif [[ "$root_cause" == *"heartbeat"* ]]; then
        recommended_action="check_network_connectivity"
    elif [[ "$root_cause" == *"rollback"* ]]; then
        recommended_action="manual_version_downgrade"
    fi
    
    local summary="{\"incident_id\":\"$incident_id\",\"root_cause\":\"$root_cause\",\"recommended_action\":\"$recommended_action\",\"agent_version\":\"$AGENT_VERSION\",\"correlation_id\":\"$correlation_id\"}"
    add_evidence "incident_summary" "$summary" "" "" "critical"
    
    log "ERROR" "[INCIDENT] Summary generated: $incident_id - $recommended_action"
}

# ============================================
#  PHASE 1: PROTECTED TARGETS (DEFENSE IN DEPTH)
# ============================================
readonly PROTECTED_PROCESSES=(
    "launchd" "kernel_task" "WindowServer" "loginwindow"
    "syslogd" "mds_stores" "securityd" "opendirectoryd"
    "diskarbitrationd" "configd" "coreaudiod"
)

readonly PROTECTED_SERVICES=(
    "com.apple.WindowServer" "com.apple.loginwindow"
    "com.apple.syslogd" "com.apple.mds" "com.apple.securityd"
    "com.apple.opendirectoryd" "com.apple.configd"
    "com.apple.audio.coreaudiod"
)

is_protected_process() {
    local target="$1"
    for p in "${PROTECTED_PROCESSES[@]}"; do
        [[ "$p" == "$target" ]] && return 0
    done
    return 1
}

is_protected_service() {
    local target="$1"
    for s in "${PROTECTED_SERVICES[@]}"; do
        [[ "$s" == "$target" ]] && return 0
    done
    return 1
}

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
mkdir -p "$LOG_DIR" "$EVIDENCE_DIR" "$CONFIG_DIR" "$KEYS_DIR"
chmod 700 "$KEYS_DIR"

# ============================================
#  BOOTSTRAP VALIDATION - CRITICAL FUNCTIONS
# ============================================
validate_critical_functions() {
    local required_functions=(
        "log"
        "send_heartbeat"
        "send_system_metrics"
        "invoke_secure_request"
        "add_evidence"
        "set_state"
    )
    
    echo "[BOOTSTRAP] Validando funcoes criticas..." >&2
    
    local missing=()
    for fn in "${required_functions[@]}"; do
        if ! declare -f "$fn" &>/dev/null; then
            missing+=("$fn")
        fi
    done
    
    if [[ ${#missing[@]} -gt 0 ]]; then
        local error_msg="FATAL: Funcoes criticas ausentes: ${missing[*]}"
        echo "[BOOTSTRAP] $error_msg" >&2
        echo "$(date '+%Y-%m-%d %H:%M:%S') | BOOTSTRAP FAILED | $error_msg" >> "${LOG_DIR}/bootstrap-error.log"
        exit 1
    fi
    
    echo "[BOOTSTRAP] Todas as funcoes criticas validadas" >&2
}

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
    
    # FSM Enterprise v2.0: HARD BLOCK - SHUTDOWN is terminal state
    if [[ "$current_state" == "SHUTDOWN" ]]; then
        log "CRITICAL" "[FSM] Agent is in SHUTDOWN state. No transitions allowed. Exiting."
        add_evidence "shutdown_block" "{\"attempted_transition\":\"$new_state\",\"reason\":\"$reason\",\"blocked\":true}" "SHUTDOWN" "SHUTDOWN" "critical"
        exit 1
    fi
    
    if [[ "$current_state" != "$new_state" ]]; then
        local allowed="${STATE_TRANSITIONS[$current_state]}"
        if [[ ! " $allowed " =~ " $new_state " ]]; then
            log "WARN" "[STATE] INVALID TRANSITION: $current_state -> $new_state (allowed: $allowed)"
            add_evidence "state_change" "{\"attempted_from\":\"$current_state\",\"attempted_to\":\"$new_state\",\"blocked\":true}" "$current_state" "$current_state" "warning"
            return 1
        fi
    fi
    
    AGENT_STATE[previous]="$current_state"
    AGENT_STATE[current]="$new_state"
    AGENT_STATE[last_state_change]=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    if [[ "$new_state" == "ENFORCING" ]]; then
        AGENT_STATE[error_count]=0
        AGENT_STATE[recovery_attempts]=0
    fi
    
    if [[ "$new_state" == "ERROR" || "$new_state" == "DEGRADED" ]]; then
        ((AGENT_STATE[error_count]++))
    fi
    
    log "INFO" "[STATE] $current_state -> $new_state ($reason)"
    
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
    
    local evidence_hash
    evidence_hash=$(echo -n "$data" | shasum -a 256 | cut -d' ' -f1)
    
    local entry
    entry=$(cat <<EOF
{"timestamp":"$timestamp","type":"$type","agent_name":"$AGENT_NAME","agent_version":"$AGENT_VERSION","state_before":"$state_before","state_after":"$state_after","severity":"$severity","data":$data,"evidence_hash":"$evidence_hash"}
EOF
)
    
    echo "$entry" >> "$EVIDENCE_FILE"
    EVIDENCE_BUFFER+=("$entry")
    
    if [[ ${#EVIDENCE_BUFFER[@]} -ge $EVIDENCE_FLUSH_THRESHOLD ]]; then
        flush_evidence
    fi
}

flush_evidence() {
    if [[ ${#EVIDENCE_BUFFER[@]} -eq 0 ]]; then
        return
    fi
    
    log "DEBUG" "[EVIDENCE] Flushing ${#EVIDENCE_BUFFER[@]} entries to server"
    
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
    
    local backoff=$((5 * (2 ** (attempt - 1))))
    
    log "WARN" "[RECOVERY] Attempt $attempt/$max_attempts for $failed_component (backoff: ${backoff}s)"
    set_state "RECOVERY" "Auto-recovery: $failed_component (attempt $attempt)"
    
    add_evidence "auto_recovery" "{\"component\":\"$failed_component\",\"attempt\":$attempt,\"backoff_seconds\":$backoff}" "" "" "warning"
    
    sleep $backoff
    
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
#  FASE 3: PROOF OF EXECUTION (PoE) - ECDSA P-256
# ============================================
generate_signing_keypair() {
    log "INFO" "[POE] Generating new ECDSA P-256 keypair..."
    
    if [[ -f "$PRIVATE_KEY_PATH" ]]; then
        cp "$PRIVATE_KEY_PATH" "$PREVIOUS_KEY_PATH" 2>/dev/null || true
    fi
    
    openssl ecparam -genkey -name prime256v1 -noout -out "$PRIVATE_KEY_PATH" 2>/dev/null
    chmod 600 "$PRIVATE_KEY_PATH"
    
    openssl ec -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH" 2>/dev/null
    
    local fingerprint
    fingerprint=$(openssl dgst -sha256 "$PUBLIC_KEY_PATH" | awk '{print $2}')
    echo "$fingerprint" > "$FINGERPRINT_PATH"
    
    SIGNING_FINGERPRINT="$fingerprint"
    log "SUCCESS" "[POE] Keypair generated (fingerprint: ${fingerprint:0:16}...)"
    
    echo "$fingerprint"
}

initialize_signing_keypair() {
    if [[ -f "$PRIVATE_KEY_PATH" && -f "$PUBLIC_KEY_PATH" && -f "$FINGERPRINT_PATH" ]]; then
        SIGNING_FINGERPRINT=$(cat "$FINGERPRINT_PATH" 2>/dev/null)
        log "INFO" "[POE] Loaded existing keypair (fingerprint: ${SIGNING_FINGERPRINT:0:16}...)"
        return 0
    fi
    
    log "INFO" "[POE] No existing keypair found, generating new one..."
    SIGNING_FINGERPRINT=$(generate_signing_keypair)
    
    if [[ -z "$SIGNING_FINGERPRINT" ]]; then
        log "ERROR" "[POE] Failed to generate keypair"
        return 1
    fi
    
    register_signing_key
}

register_signing_key() {
    log "INFO" "[POE] Registering public key with backend..."
    
    local public_key_b64
    public_key_b64=$(base64 "$PUBLIC_KEY_PATH" 2>/dev/null | tr -d '\n')
    
    local body
    body=$(cat <<EOF
{"agent_name":"$AGENT_NAME","public_key":"$public_key_b64","key_fingerprint":"$SIGNING_FINGERPRINT","algorithm":"ECDSA-P256-SHA256"}
EOF
)
    
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/register-agent-key" "$body" 30)
    
    if [[ $? -eq 0 ]]; then
        log "SUCCESS" "[POE] Public key registered successfully"
        add_evidence "poe_key_registered" "{\"fingerprint\":\"$SIGNING_FINGERPRINT\",\"algorithm\":\"ECDSA-P256-SHA256\"}" "" "" "info"
        return 0
    else
        log "WARN" "[POE] Failed to register public key (will retry later)"
        return 1
    fi
}

compute_output_hash() {
    local output="$1"
    echo -n "$output" | shasum -a 256 | cut -d' ' -f1
}

sign_execution_result() {
    local execution_id="$1"
    local job_id="$2"
    local nonce="$3"
    local output_hash="$4"
    local status="$5"
    
    local canonical="${execution_id}|${job_id}|${nonce}|${output_hash}|${status}"
    
    local signature
    signature=$(echo -n "$canonical" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" 2>/dev/null | base64 2>/dev/null | tr -d '\n')
    
    echo "$signature"
}

# ============================================
#  FASE 4: AUTO-UPDATE + ROLLBACK
# ============================================
get_rollback_state() {
    if [[ -f "$ROLLBACK_STATE_FILE" ]]; then
        cat "$ROLLBACK_STATE_FILE"
    else
        echo '{"rollback_count":0,"safe_mode":false,"previous_version":"","last_rollback":"","last_health_check":""}'
    fi
}

save_rollback_state() {
    local state="$1"
    echo "$state" > "$ROLLBACK_STATE_FILE"
}

is_safe_mode() {
    local state
    state=$(get_rollback_state)
    local safe_mode
    safe_mode=$(echo "$state" | python3 -c "import sys,json; print(json.load(sys.stdin).get('safe_mode', False))" 2>/dev/null || echo "false")
    [[ "$safe_mode" == "True" || "$safe_mode" == "true" ]]
}

apply_forced_update() {
    local response="$1"
    
    log "INFO" "[UPDATE] Processing forced update..."
    
    if is_safe_mode; then
        log "ERROR" "[UPDATE] BLOCKED: Safe mode active - updates disabled"
        add_evidence "update_blocked" "{\"reason\":\"safe_mode_active\"}" "" "" "warning"
        return 1
    fi
    
    local target_version
    target_version=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('target_version', ''))" 2>/dev/null)
    local base64_content
    base64_content=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('script_content_base64', ''))" 2>/dev/null)
    local expected_hash
    expected_hash=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sha256', ''))" 2>/dev/null)
    
    if [[ -z "$base64_content" || -z "$expected_hash" ]]; then
        log "ERROR" "[UPDATE] Invalid update payload - missing content or hash"
        return 1
    fi
    
    local temp_script="/tmp/cybershield-update-$$.sh"
    echo "$base64_content" | base64 -D > "$temp_script" 2>/dev/null
    
    if [[ ! -s "$temp_script" ]]; then
        log "ERROR" "[UPDATE] Failed to decode update content"
        rm -f "$temp_script"
        return 1
    fi
    
    local actual_hash
    actual_hash=$(shasum -a 256 "$temp_script" | cut -d' ' -f1)
    
    if [[ "$actual_hash" != "$expected_hash" ]]; then
        log "ERROR" "[UPDATE] SHA256 MISMATCH! Expected: $expected_hash, Got: $actual_hash"
        add_evidence "update_rejected" "{\"reason\":\"sha256_mismatch\",\"expected\":\"$expected_hash\",\"actual\":\"$actual_hash\"}" "" "" "critical"
        rm -f "$temp_script"
        return 1
    fi
    
    log "SUCCESS" "[UPDATE] SHA256 validated: $actual_hash"
    
    local current_script="$0"
    cp "$current_script" "$PREVIOUS_SCRIPT_PATH" 2>/dev/null || true
    
    local state
    state=$(get_rollback_state)
    state=$(echo "$state" | python3 -c "import sys,json; d=json.load(sys.stdin); d['previous_version']='$AGENT_VERSION'; print(json.dumps(d))" 2>/dev/null)
    save_rollback_state "$state"
    
    cp "$temp_script" "$current_script"
    chmod +x "$current_script"
    rm -f "$temp_script"
    
    log "SUCCESS" "[UPDATE] Update $target_version applied!"
    add_evidence "update_applied" "{\"from_version\":\"$AGENT_VERSION\",\"to_version\":\"$target_version\",\"sha256\":\"$actual_hash\"}" "" "" "info"
    
    local confirm_body
    confirm_body="{\"agent_name\":\"$AGENT_NAME\",\"new_version\":\"$target_version\",\"old_version\":\"$AGENT_VERSION\"}"
    invoke_secure_request "POST" "/functions/v1/confirm-force-update" "$confirm_body" 10 || true
    
    restart_agent_service
}

handle_update_agent() {
    local job="$1"
    log "INFO" "[UPDATE] Processing update_agent job..."
    
    if is_safe_mode; then
        echo '{"success":false,"error":"Safe mode active - updates disabled"}'
        return 1
    fi
    
    local base64_content
    base64_content=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload',{}).get('script_content_base64',''))" 2>/dev/null)
    local expected_hash
    expected_hash=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload',{}).get('sha256',''))" 2>/dev/null)
    local target_version
    target_version=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload',{}).get('target_version',''))" 2>/dev/null)
    
    if [[ -z "$base64_content" || -z "$expected_hash" ]]; then
        echo '{"success":false,"error":"Invalid update payload"}'
        return 1
    fi
    
    local update_response
    update_response="{\"target_version\":\"$target_version\",\"script_content_base64\":\"$base64_content\",\"sha256\":\"$expected_hash\"}"
    
    if apply_forced_update "$update_response"; then
        echo '{"success":true,"output":"Update applied successfully"}'
    else
        echo '{"success":false,"error":"Update failed"}'
        return 1
    fi
}

test_post_update_health() {
    log "INFO" "[HEALTH] Running post-update health check..."
    
    local checks_passed=0
    local total_checks=3
    
    if [[ "$(get_state)" != "ERROR" ]]; then
        ((checks_passed++))
    fi
    
    if send_heartbeat 2>/dev/null; then
        ((checks_passed++))
    fi
    
    if poll_jobs 2>/dev/null; then
        ((checks_passed++))
    fi
    
    if [[ $checks_passed -lt $total_checks ]]; then
        log "ERROR" "[HEALTH] Post-update health check FAILED ($checks_passed/$total_checks)"
        invoke_safe_rollback "Health check failed after update"
        return 1
    fi
    
    log "SUCCESS" "[HEALTH] Post-update health check OK ($checks_passed/$total_checks)"
    
    local state
    state=$(get_rollback_state)
    state=$(echo "$state" | python3 -c "import sys,json; d=json.load(sys.stdin); d['rollback_count']=0; d['last_health_check']='$(date -u +%Y-%m-%dT%H:%M:%SZ)'; print(json.dumps(d))" 2>/dev/null)
    save_rollback_state "$state"
    
    return 0
}

invoke_safe_rollback() {
    local reason="$1"
    
    log "WARN" "[ROLLBACK] Initiating rollback: $reason"
    add_evidence "rollback_initiated" "{\"reason\":\"$reason\"}" "" "" "warning"
    
    if [[ ! -f "$PREVIOUS_SCRIPT_PATH" ]]; then
        log "ERROR" "[ROLLBACK] Previous version not found - cannot rollback"
        return 1
    fi
    
    local state
    state=$(get_rollback_state)
    local count
    count=$(echo "$state" | python3 -c "import sys,json; print(json.load(sys.stdin).get('rollback_count', 0))" 2>/dev/null || echo 0)
    count=$((count + 1))
    
    if [[ $count -ge 2 ]]; then
        log "ERROR" "[CRITICAL] Rollback loop detected - ENTERING SAFE MODE"
        state=$(echo "$state" | python3 -c "import sys,json; d=json.load(sys.stdin); d['safe_mode']=True; d['rollback_count']=$count; print(json.dumps(d))" 2>/dev/null)
        save_rollback_state "$state"
        
        invoke_secure_request "POST" "/functions/v1/submit-rollback-event" \
            "{\"agent_name\":\"$AGENT_NAME\",\"safe_mode\":true,\"rollback_count\":$count,\"reason\":\"$reason\"}" 10 || true
        
        add_evidence "safe_mode_entered" "{\"rollback_count\":$count,\"reason\":\"$reason\"}" "" "" "critical"
        return 1
    fi
    
    state=$(echo "$state" | python3 -c "import sys,json; d=json.load(sys.stdin); d['rollback_count']=$count; d['last_rollback']='$(date -u +%Y-%m-%dT%H:%M:%SZ)'; print(json.dumps(d))" 2>/dev/null)
    save_rollback_state "$state"
    
    cp "$PREVIOUS_SCRIPT_PATH" "$0"
    chmod +x "$0"
    
    log "INFO" "[ROLLBACK] Previous version restored (rollback #$count)"
    add_evidence "rollback_completed" "{\"rollback_count\":$count}" "" "" "warning"
    
    invoke_secure_request "POST" "/functions/v1/submit-rollback-event" \
        "{\"agent_name\":\"$AGENT_NAME\",\"safe_mode\":false,\"rollback_count\":$count,\"reason\":\"$reason\"}" 10 || true
    
    restart_agent_service
}

restart_agent_service() {
    log "INFO" "[SERVICE] Restarting agent service..."
    
    launchctl stop com.cybershield.agent 2>/dev/null || true
    sleep 2
    launchctl start com.cybershield.agent 2>/dev/null || true
    
    exit 0
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
    blocked_synced=$(test -f "$BLOCKED_WEBSITES_FILE" && echo "true" || echo "false")
    
    cat <<EOF
{"dns_enabled":"$DNS_FILTER_ENABLED","dns_service_running":"$dns_running","dns_installed":"$dns_installed","agent_version":"$AGENT_VERSION","agent_state":"$agent_state","job_execution_enabled":"$can_execute","heartbeat_interval":"$POLL_INTERVAL","blocked_domains_synced":"$blocked_synced","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
}

check_policy_compliance() {
    local current
    current=$(get_current_policy_state)
    local drift_count=0
    
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
#  HEARTBEAT (with force_update detection)
# ============================================
send_heartbeat() {
    local os_version
    os_version=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
    
    local body
    body=$(cat <<EOF
{"agent_name":"$AGENT_NAME","hostname":"$(hostname)","os_type":"macos","os_version":"$os_version","agent_version":"$AGENT_VERSION","state":"$(get_state)","error_count":${AGENT_STATE[error_count]},"signing_fingerprint":"$SIGNING_FINGERPRINT"}
EOF
)
    
    log "INFO" "[HEARTBEAT] Sending heartbeat (state: $(get_state))..."
    
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/heartbeat" "$body" 15)
    
    if [[ $? -eq 0 ]]; then
        log "SUCCESS" "[HEARTBEAT] OK (200)"
        add_evidence "heartbeat" "{\"status\":\"success\",\"state\":\"$(get_state)\"}" "" "" "debug"
        
        local force_update
        force_update=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('force_update', False))" 2>/dev/null || echo "false")
        
        if [[ "$force_update" == "True" || "$force_update" == "true" ]]; then
            log "WARN" "[HEARTBEAT] Force update detected!"
            apply_forced_update "$result"
        fi
        
        local rotate_key
        rotate_key=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('rotate_key', False))" 2>/dev/null || echo "false")
        
        if [[ "$rotate_key" == "True" || "$rotate_key" == "true" ]]; then
            log "WARN" "[HEARTBEAT] Key rotation requested"
            generate_signing_keypair
            register_signing_key
        fi
        
        return 0
    else
        log "ERROR" "[HEARTBEAT] Failed"
        return 1
    fi
}

# ============================================
#  SEND SYSTEM METRICS
# ============================================
send_system_metrics() {
    log "DEBUG" "[METRICS] Collecting system metrics..."
    
    local metrics
    metrics=$(collect_system_metrics 2>/dev/null)
    
    if [[ -z "$metrics" ]]; then
        log "WARN" "[METRICS] Failed to collect metrics"
        return 1
    fi
    
    log "DEBUG" "[METRICS] Sending metrics to backend..."
    
    local body
    body="{\"agent_name\":\"$AGENT_NAME\",\"agent_version\":\"$AGENT_VERSION\",\"metrics\":$metrics}"
    
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/submit-system-metrics" "$body" 15)
    
    if [[ $? -eq 0 ]]; then
        local cpu mem disk
        cpu=$(echo "$metrics" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cpu_percent', '?'))" 2>/dev/null || echo "?")
        mem=$(echo "$metrics" | python3 -c "import sys,json; print(json.load(sys.stdin).get('memory_percent', '?'))" 2>/dev/null || echo "?")
        disk=$(echo "$metrics" | python3 -c "import sys,json; print(json.load(sys.stdin).get('disk_percent', '?'))" 2>/dev/null || echo "?")
        log "SUCCESS" "[METRICS] Sent: CPU=${cpu}%, RAM=${mem}%, Disk=${disk}%"
        return 0
    else
        log "WARN" "[METRICS] Failed to send metrics"
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
    
    local job_count
    job_count=$(echo "$result" | python3 -c "import sys,json; data=json.load(sys.stdin); print(len(data) if isinstance(data, list) else 0)" 2>/dev/null || echo 0)
    
    if [[ "$job_count" == "0" ]]; then
        log "DEBUG" "[POLL] No jobs available"
        return 0
    fi
    
    log "INFO" "[JOBS] Received $job_count job(s)"
    
    for i in $(seq 0 $((job_count - 1))); do
        local job
        job=$(echo "$result" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)[$i]))" 2>/dev/null)
        if [[ -n "$job" ]]; then
            execute_job "$job"
        fi
    done
}

# ============================================
#  SSA-004: JOB SIGNATURE VERIFICATION
# ============================================
verify_job_signature() {
    local job="$1"
    
    local job_id
    job_id=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
    local job_type
    job_type=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type', ''))" 2>/dev/null)
    local signature
    signature=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload_signature', ''))" 2>/dev/null)
    local signing_alg
    signing_alg=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('signing_alg', ''))" 2>/dev/null)
    
    if [[ -z "$ED25519_PUBLIC_KEY" ]]; then
        log "WARN" "[SECURITY] Ed25519 public key not configured - skipping signature verification"
        return 0
    fi
    
    if [[ -z "$signature" ]]; then
        if [[ "$REQUIRE_JOB_SIGNATURES" == "true" ]]; then
            log "ERROR" "[SECURITY] REJECTED: Job $job_id has no signature (signatures required)"
            add_evidence "security_alert" "{\"event\":\"unsigned_job_rejected\",\"job_id\":\"$job_id\",\"job_type\":\"$job_type\"}" "" "" "critical"
            return 1
        fi
        log "WARN" "[SECURITY] Job $job_id has no signature (backward compatible mode)"
        return 0
    fi
    
    if [[ -n "$signing_alg" && "$signing_alg" != "Ed25519" ]]; then
        log "ERROR" "[SECURITY] REJECTED: Unsupported signing algorithm: $signing_alg"
        return 1
    fi
    
    log "INFO" "[SECURITY] Verifying Ed25519 signature for job $job_id..."
    
    local payload_json
    payload_json=$(echo "$job" | python3 -c "import sys,json; j=json.load(sys.stdin); print(json.dumps(j.get('payload', {}), sort_keys=True, separators=(',',':')))" 2>/dev/null)
    local canonical_payload="${job_id}:${job_type}:${payload_json}"
    
    local temp_dir
    temp_dir=$(mktemp -d)
    local pubkey_file="${temp_dir}/pubkey.pem"
    local sig_file="${temp_dir}/signature.bin"
    local payload_file="${temp_dir}/payload.txt"
    
    echo "-----BEGIN PUBLIC KEY-----" > "$pubkey_file"
    echo "$ED25519_PUBLIC_KEY" >> "$pubkey_file"
    echo "-----END PUBLIC KEY-----" >> "$pubkey_file"
    
    echo -n "$signature" | base64 -D > "$sig_file" 2>/dev/null || {
        log "ERROR" "[SECURITY] Failed to decode signature from Base64"
        rm -rf "$temp_dir"
        return 1
    }
    
    echo -n "$canonical_payload" > "$payload_file"
    
    if openssl pkeyutl -verify -pubin -inkey "$pubkey_file" -rawin -in "$payload_file" -sigfile "$sig_file" 2>/dev/null; then
        log "SUCCESS" "[SECURITY] Job $job_id signature verified successfully"
        add_evidence "security_check" "{\"event\":\"job_signature_verified\",\"job_id\":\"$job_id\",\"job_type\":\"$job_type\",\"algorithm\":\"Ed25519\"}" "" "" "info"
        rm -rf "$temp_dir"
        return 0
    else
        log "ERROR" "[SECURITY] REJECTED: Job $job_id signature verification FAILED"
        add_evidence "security_alert" "{\"event\":\"invalid_job_signature\",\"job_id\":\"$job_id\",\"job_type\":\"$job_type\"}" "" "" "critical"
        rm -rf "$temp_dir"
        return 1
    fi
}

# ============================================
#  EXECUTE JOB (with PoE signing)
# ============================================
execute_job() {
    local job="$1"
    
    if ! can_execute_job; then
        local state
        state=$(get_state)
        log "WARN" "[JOB] Cannot execute job in state $state"
        return 1
    fi
    
    if ! verify_job_signature "$job"; then
        local job_id
        job_id=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
        log "ERROR" "[SECURITY] BLOCKED: Job $job_id rejected due to invalid/missing signature"
        submit_job_result "$job_id" "failed" "{}" "Security: Invalid or missing payload signature" "0" "security-rejected" ""
        return 1
    fi
    
    local job_id
    job_id=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
    local job_type
    job_type=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type', ''))" 2>/dev/null)
    local job_nonce
    job_nonce=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('nonce', ''))" 2>/dev/null)
    local execution_id="exec-$(uuidgen | tr '[:upper:]' '[:lower:]')"
    local start_time
    start_time=$(date +%s)
    
    log "INFO" "[JOB] Executing job $job_id (type=$job_type, exec_id=$execution_id)"
    
    add_evidence "job_execution" "{\"job_id\":\"$job_id\",\"job_type\":\"$job_type\",\"execution_id\":\"$execution_id\",\"phase\":\"started\",\"signature_verified\":true}" "" "" "info"
    
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
        "sync_blocked_websites")
            local result
            result=$(handle_sync_blocked_websites "$job")
            if echo "$result" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
                output="$result"
            else
                status="failed"
                error_message=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null)
            fi
            ;;
        "update_agent")
            local result
            result=$(handle_update_agent "$job")
            if echo "$result" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
                output="$result"
            else
                status="failed"
                error_message=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null)
            fi
            ;;
        "kill_process")
            local result
            result=$(handle_kill_process "$job")
            if echo "$result" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
                output="$result"
            else
                status="failed"
                error_message=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null)
            fi
            ;;
        "stop_service")
            local result
            result=$(handle_stop_service "$job")
            if echo "$result" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
                output="$result"
            else
                status="failed"
                error_message=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null)
            fi
            ;;
        "disable_service")
            local result
            result=$(handle_disable_service "$job")
            if echo "$result" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
                output="$result"
            else
                status="failed"
                error_message=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null)
            fi
            ;;
        "restart_service")
            local result
            result=$(handle_restart_service "$job")
            if echo "$result" | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('success') else 1)" 2>/dev/null; then
                output="$result"
            else
                status="failed"
                error_message=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))" 2>/dev/null)
            fi
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
    
    submit_job_result "$job_id" "$status" "$output" "$error_message" "$exec_time" "$execution_id" "$job_nonce"
}

submit_job_result() {
    local job_id="$1"
    local status="$2"
    local output="$3"
    local error_message="$4"
    local exec_time="$5"
    local execution_id="$6"
    local nonce="${7:-}"
    
    local output_hash=""
    local result_signature=""
    local signature_algorithm=""
    
    if [[ -n "$nonce" && -f "$PRIVATE_KEY_PATH" ]]; then
        output_hash=$(compute_output_hash "$output")
        result_signature=$(sign_execution_result "$execution_id" "$job_id" "$nonce" "$output_hash" "$status")
        signature_algorithm="ECDSA-P256-SHA256"
        log "DEBUG" "[POE] Result signed (output_hash: ${output_hash:0:16}...)"
    fi
    
    local body
    body=$(cat <<EOF
{"job_id":"$job_id","status":"$status","output":$output,"error_message":"$error_message","execution_time_seconds":$exec_time,"agent_name":"$AGENT_NAME","agent_version":"$AGENT_VERSION","execution_id":"$execution_id","output_hash":"$output_hash","result_signature":"$result_signature","signature_algorithm":"$signature_algorithm","key_fingerprint":"$SIGNING_FINGERPRINT"}
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
    
    if [[ -d "/System/Library/CoreServices/XProtect.bundle" ]]; then
        local version
        version=$(defaults read /System/Library/CoreServices/XProtect.bundle/Contents/Info CFBundleShortVersionString 2>/dev/null || echo "unknown")
        engines="[{\"name\":\"XProtect\",\"version\":\"$version\",\"enabled\":true}]"
    fi
    
    cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","hostname":"$(hostname)","engines":$engines}
EOF
}

# ============================================
#  FASE 1: BROWSER HISTORY COLLECTION (macOS)
# ============================================
check_sqlite3() {
    if ! command -v sqlite3 &>/dev/null; then
        log "ERROR" "[WEB-ACTIVITY] sqlite3 not installed - browser history collection disabled"
        return 1
    fi
    return 0
}

normalize_timestamp() {
    local raw="$1"
    local browser="$2"
    local ts_unix=0
    
    case "$browser" in
        chromium)
            ts_unix=$((raw / 1000000 - 11644473600))
            ;;
        firefox)
            ts_unix=$((raw / 1000000))
            ;;
        safari)
            # Safari: seconds since 2001-01-01
            ts_unix=$((raw + 978307200))
            ;;
    esac
    
    date -u -r "$ts_unix" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo ""
}

is_duplicate_entry() {
    local entry_id="$1"
    [[ -f "$WEB_ACTIVITY_SEEN_FILE" ]] && grep -q "^${entry_id}$" "$WEB_ACTIVITY_SEEN_FILE" 2>/dev/null
}

add_seen_entry() {
    local entry_id="$1"
    echo "$entry_id" >> "$WEB_ACTIVITY_SEEN_FILE"
}

cleanup_seen_cache() {
    if [[ -f "$WEB_ACTIVITY_SEEN_FILE" ]]; then
        tail -n 10000 "$WEB_ACTIVITY_SEEN_FILE" > "${WEB_ACTIVITY_SEEN_FILE}.tmp" 2>/dev/null
        mv "${WEB_ACTIVITY_SEEN_FILE}.tmp" "$WEB_ACTIVITY_SEEN_FILE" 2>/dev/null || true
    fi
}

get_real_users_macos() {
    for user_home in /Users/*; do
        local username=$(basename "$user_home")
        [[ "$username" =~ ^(Shared|Guest|.localized)$ ]] && continue
        [[ -d "$user_home/Library" ]] || continue
        echo "$username:$user_home"
    done
}

collect_chromium_history() {
    local db_path="$1"
    local username="$2"
    local browser_name="$3"
    local items_json=""
    
    if [[ ! -f "$db_path" ]]; then
        return
    fi
    
    local temp_db="/tmp/cybershield-history-$$.db"
    cp "$db_path" "$temp_db" 2>/dev/null || return
    
    local query="SELECT url, title, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 100;"
    
    while IFS='|' read -r url title last_visit visit_count; do
        [[ -z "$url" ]] && continue
        
        local ts_iso
        ts_iso=$(normalize_timestamp "$last_visit" "chromium")
        [[ -z "$ts_iso" ]] && continue
        
        local entry_id
        entry_id=$(echo -n "${url}|${ts_iso}|${username}" | shasum -a 256 | cut -d' ' -f1)
        
        if is_duplicate_entry "$entry_id"; then
            continue
        fi
        add_seen_entry "$entry_id"
        
        local domain
        domain=$(echo "$url" | sed -E 's|https?://([^/]+).*|\1|')
        
        title=$(echo "$title" | sed 's/"/\\"/g' | tr -d '\n\r')
        
        if [[ -n "$items_json" ]]; then
            items_json+=","
        fi
        items_json+="{\"url\":\"$url\",\"title\":\"$title\",\"domain\":\"$domain\",\"visited_at\":\"$ts_iso\",\"visit_count\":$visit_count,\"browser\":\"$browser_name\",\"username\":\"$username\"}"
        
    done < <(sqlite3 -separator '|' "$temp_db" "$query" 2>/dev/null)
    
    rm -f "$temp_db"
    echo "$items_json"
}

collect_firefox_history() {
    local db_path="$1"
    local username="$2"
    local items_json=""
    
    if [[ ! -f "$db_path" ]]; then
        return
    fi
    
    local temp_db="/tmp/cybershield-firefox-$$.db"
    cp "$db_path" "$temp_db" 2>/dev/null || return
    
    local query="SELECT url, title, last_visit_date, visit_count FROM moz_places WHERE visit_count > 0 ORDER BY last_visit_date DESC LIMIT 100;"
    
    while IFS='|' read -r url title last_visit visit_count; do
        [[ -z "$url" ]] && continue
        
        local ts_iso
        ts_iso=$(normalize_timestamp "$last_visit" "firefox")
        [[ -z "$ts_iso" ]] && continue
        
        local entry_id
        entry_id=$(echo -n "${url}|${ts_iso}|${username}" | shasum -a 256 | cut -d' ' -f1)
        
        if is_duplicate_entry "$entry_id"; then
            continue
        fi
        add_seen_entry "$entry_id"
        
        local domain
        domain=$(echo "$url" | sed -E 's|https?://([^/]+).*|\1|')
        
        title=$(echo "$title" | sed 's/"/\\"/g' | tr -d '\n\r')
        
        if [[ -n "$items_json" ]]; then
            items_json+=","
        fi
        items_json+="{\"url\":\"$url\",\"title\":\"$title\",\"domain\":\"$domain\",\"visited_at\":\"$ts_iso\",\"visit_count\":$visit_count,\"browser\":\"Firefox\",\"username\":\"$username\"}"
        
    done < <(sqlite3 -separator '|' "$temp_db" "$query" 2>/dev/null)
    
    rm -f "$temp_db"
    echo "$items_json"
}

collect_safari_history() {
    local user_home="$1"
    local username="$2"
    local items_json=""
    
    local safari_db="$user_home/Library/Safari/History.db"
    
    if [[ ! -f "$safari_db" ]]; then
        return
    fi
    
    # Check Full Disk Access permission
    if [[ ! -r "$safari_db" ]]; then
        log "WARN" "[WEB-ACTIVITY] Safari: FULL_DISK_ACCESS_REQUIRED for $username"
        echo "{\"browser\":\"Safari\",\"error\":\"FULL_DISK_ACCESS_REQUIRED\",\"username\":\"$username\"}"
        return
    fi
    
    local temp_db="/tmp/cybershield-safari-$$.db"
    cp "$safari_db" "$temp_db" 2>/dev/null || return
    
    local query="SELECT history_items.url, history_visits.visit_time FROM history_items JOIN history_visits ON history_items.id = history_visits.history_item ORDER BY visit_time DESC LIMIT 100;"
    
    while IFS='|' read -r url visit_time; do
        [[ -z "$url" ]] && continue
        
        local ts_iso
        ts_iso=$(normalize_timestamp "${visit_time%.*}" "safari")
        [[ -z "$ts_iso" ]] && continue
        
        local entry_id
        entry_id=$(echo -n "${url}|${ts_iso}|${username}" | shasum -a 256 | cut -d' ' -f1)
        
        if is_duplicate_entry "$entry_id"; then
            continue
        fi
        add_seen_entry "$entry_id"
        
        local domain
        domain=$(echo "$url" | sed -E 's|https?://([^/]+).*|\1|')
        
        if [[ -n "$items_json" ]]; then
            items_json+=","
        fi
        items_json+="{\"url\":\"$url\",\"title\":\"\",\"domain\":\"$domain\",\"visited_at\":\"$ts_iso\",\"visit_count\":1,\"browser\":\"Safari\",\"username\":\"$username\"}"
        
    done < <(sqlite3 -separator '|' "$temp_db" "$query" 2>/dev/null)
    
    rm -f "$temp_db"
    echo "$items_json"
}

collect_web_activity() {
    if ! check_sqlite3; then
        cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","hostname":"$(hostname)","error":"SQLITE3_NOT_INSTALLED","items":[]}
EOF
        return
    fi
    
    log "INFO" "[WEB-ACTIVITY] Collecting browser history..."
    
    local all_items=""
    local errors=""
    
    while IFS=: read -r username homedir; do
        [[ -z "$homedir" || ! -d "$homedir" ]] && continue
        
        # Chrome
        local chrome_db="$homedir/Library/Application Support/Google/Chrome/Default/History"
        local chrome_items
        chrome_items=$(collect_chromium_history "$chrome_db" "$username" "Chrome")
        [[ -n "$chrome_items" ]] && { [[ -n "$all_items" ]] && all_items+=","; all_items+="$chrome_items"; }
        
        # Firefox
        for ff_profile in "$homedir/Library/Application Support/Firefox/Profiles/"*.default*/places.sqlite; do
            [[ -f "$ff_profile" ]] || continue
            local ff_items
            ff_items=$(collect_firefox_history "$ff_profile" "$username")
            [[ -n "$ff_items" ]] && { [[ -n "$all_items" ]] && all_items+=","; all_items+="$ff_items"; }
        done
        
        # Safari
        local safari_result
        safari_result=$(collect_safari_history "$homedir" "$username")
        if echo "$safari_result" | grep -q "FULL_DISK_ACCESS_REQUIRED"; then
            [[ -n "$errors" ]] && errors+=","
            errors+="$safari_result"
        elif [[ -n "$safari_result" ]]; then
            [[ -n "$all_items" ]] && all_items+=","
            all_items+="$safari_result"
        fi
        
        # Opera
        local opera_db="$homedir/Library/Application Support/com.operasoftware.Opera/History"
        local opera_items
        opera_items=$(collect_chromium_history "$opera_db" "$username" "Opera")
        [[ -n "$opera_items" ]] && { [[ -n "$all_items" ]] && all_items+=","; all_items+="$opera_items"; }
        
        # Opera GX
        local operagx_db="$homedir/Library/Application Support/com.operasoftware.OperaGX/History"
        local operagx_items
        operagx_items=$(collect_chromium_history "$operagx_db" "$username" "Opera GX")
        [[ -n "$operagx_items" ]] && { [[ -n "$all_items" ]] && all_items+=","; all_items+="$operagx_items"; }
        
        # Edge
        local edge_db="$homedir/Library/Application Support/Microsoft Edge/Default/History"
        local edge_items
        edge_items=$(collect_chromium_history "$edge_db" "$username" "Edge")
        [[ -n "$edge_items" ]] && { [[ -n "$all_items" ]] && all_items+=","; all_items+="$edge_items"; }
        
    done < <(get_real_users_macos)
    
    cleanup_seen_cache
    
    local item_count=0
    [[ -n "$all_items" ]] && item_count=$(echo "[$all_items]" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
    
    log "SUCCESS" "[WEB-ACTIVITY] Collected $item_count history items"
    
    cat <<EOF
{"timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","hostname":"$(hostname)","item_count":$item_count,"items":[$all_items],"errors":[$errors]}
EOF
}

# ============================================
#  FASE 2: SITE BLOCKING VIA /etc/hosts
# ============================================
handle_sync_blocked_websites() {
    local job="$1"
    log "INFO" "[BLOCKED-SITES] Syncing blocked websites..."
    
    local result
    result=$(invoke_secure_request "GET" "/functions/v1/get-blocked-websites" "" 30)
    
    if [[ $? -ne 0 || -z "$result" ]]; then
        log "ERROR" "[BLOCKED-SITES] Failed to fetch blocked websites list"
        echo '{"success":false,"error":"Failed to fetch blocked websites"}'
        return 1
    fi
    
    echo "$result" > "$BLOCKED_WEBSITES_FILE"
    
    local domains
    domains=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); [print(w.get('domain_pattern') or w) for w in d.get('blocked_websites', d.get('blocked_domains', []))]" 2>/dev/null | sort -u)
    
    if [[ -z "$domains" ]]; then
        log "INFO" "[BLOCKED-SITES] No domains to block"
        echo '{"success":true,"count":0}'
        return 0
    fi
    
    apply_hosts_blocking "$domains"
    
    local count
    count=$(echo "$domains" | wc -l | tr -d ' ')
    
    log "SUCCESS" "[BLOCKED-SITES] $count domains blocked"
    add_evidence "blocked_sites_synced" "{\"count\":$count}" "" "" "info"
    
    echo "{\"success\":true,\"count\":$count}"
}

apply_hosts_blocking() {
    local domains="$1"
    local hosts_file="/etc/hosts"
    local marker_start="# CyberShield BLOCK START"
    local marker_end="# CyberShield BLOCK END"
    
    local tmp_hosts
    tmp_hosts=$(mktemp)
    cp "$hosts_file" "$tmp_hosts"
    
    # Remove old block using sed (macOS compatible)
    sed -i '' "/$marker_start/,/$marker_end/d" "$tmp_hosts" 2>/dev/null || \
    sed "/$marker_start/,/$marker_end/d" "$tmp_hosts" > "${tmp_hosts}.new" && mv "${tmp_hosts}.new" "$tmp_hosts"
    
    {
        echo "$marker_start"
        echo "$domains" | while read -r domain; do
            [[ -n "$domain" ]] && echo "127.0.0.1 $domain"
            [[ -n "$domain" ]] && echo "127.0.0.1 www.$domain"
        done
        echo "$marker_end"
    } >> "$tmp_hosts"
    
    mv "$tmp_hosts" "$hosts_file"
    
    flush_dns_cache
    
    log "INFO" "[BLOCKED-SITES] /etc/hosts updated"
}

flush_dns_cache() {
    # macOS DNS cache flush
    dscacheutil -flushcache 2>/dev/null || true
    killall -HUP mDNSResponder 2>/dev/null || true
}

# ============================================
#  PHASE 1: PROCESS CONTROL HANDLERS (macOS)
# ============================================
handle_kill_process() {
    local job="$1"
    local name
    name=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload',{}).get('process_name',''))" 2>/dev/null)
    
    [[ -z "$name" ]] && { echo '{"success":false,"error":"process_name ausente"}'; return 1; }
    
    if is_protected_process "$name"; then
        log "WARN" "[KILL-PROCESS] BLOCKED: protected process ($name)"
        echo "{\"success\":false,\"error\":\"SECURITY: protected process ($name)\"}"
        return 1
    fi
    
    if ! pgrep "$name" >/dev/null 2>&1; then
        echo "{\"success\":false,\"error\":\"process not found ($name)\"}"
        return 1
    fi
    
    local count
    count=$(pgrep -c "$name" 2>/dev/null || echo 0)
    
    killall "$name" 2>/dev/null
    
    log "INFO" "[KILL-PROCESS] Process '$name' terminated ($count instances)"
    echo "{\"success\":true,\"output\":\"Process '$name' terminated ($count instances)\"}"
}

handle_stop_service() {
    local job="$1"
    local svc
    svc=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload',{}).get('service_name',''))" 2>/dev/null)
    
    [[ -z "$svc" ]] && { echo '{"success":false,"error":"service_name ausente"}'; return 1; }
    
    if is_protected_service "$svc"; then
        log "WARN" "[STOP-SERVICE] BLOCKED: protected service ($svc)"
        echo "{\"success\":false,\"error\":\"SECURITY: protected service ($svc)\"}"
        return 1
    fi
    
    launchctl stop "$svc" 2>/dev/null
    
    log "INFO" "[STOP-SERVICE] Service '$svc' stopped"
    echo "{\"success\":true,\"output\":\"Service '$svc' stopped\"}"
}

handle_disable_service() {
    local job="$1"
    local svc
    svc=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload',{}).get('service_name',''))" 2>/dev/null)
    
    [[ -z "$svc" ]] && { echo '{"success":false,"error":"service_name ausente"}'; return 1; }
    
    if is_protected_service "$svc"; then
        log "WARN" "[DISABLE-SERVICE] BLOCKED: protected service ($svc)"
        echo "{\"success\":false,\"error\":\"SECURITY: protected service ($svc)\"}"
        return 1
    fi
    
    launchctl stop "$svc" 2>/dev/null || true
    launchctl disable "system/$svc" 2>/dev/null
    
    log "INFO" "[DISABLE-SERVICE] Service '$svc' disabled"
    echo "{\"success\":true,\"output\":\"Service '$svc' disabled\"}"
}

handle_restart_service() {
    local job="$1"
    local svc
    svc=$(echo "$job" | python3 -c "import sys,json; print(json.load(sys.stdin).get('payload',{}).get('service_name',''))" 2>/dev/null)
    
    [[ -z "$svc" ]] && { echo '{"success":false,"error":"service_name ausente"}'; return 1; }
    
    if is_protected_service "$svc"; then
        log "WARN" "[RESTART-SERVICE] BLOCKED: protected service ($svc)"
        echo "{\"success\":false,\"error\":\"SECURITY: protected service ($svc)\"}"
        return 1
    fi
    
    launchctl stop "$svc" 2>/dev/null || true
    sleep 1
    launchctl start "$svc" 2>/dev/null
    
    log "INFO" "[RESTART-SERVICE] Service '$svc' restarted"
    echo "{\"success\":true,\"output\":\"Service '$svc' restarted\"}"
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

# Bootstrap validation
validate_critical_functions

log "INFO" "============================================"
log "INFO" "[START] CyberShield Agent $AGENT_VERSION - macOS"
log "INFO" "[INFO] ServerUrl: $SERVER_URL"
log "INFO" "[INFO] AgentName: $AGENT_NAME"
log "INFO" "[FEATURES] PoE, Auto-Update, Browser History, Site Blocking"
log "INFO" "============================================"

add_evidence "state_change" "{\"event\":\"agent_started\",\"version\":\"$AGENT_VERSION\",\"hostname\":\"$(hostname)\",\"features\":[\"poe\",\"auto_update\",\"browser_history\",\"site_blocking\",\"state_machine\",\"evidence_journal\"]}" "" "BOOTSTRAP" "info"

# Bootstrap
set_state "SYNCING" "Starting initial sync"

# Initialize PoE signing keypair
initialize_signing_keypair || true

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
last_metrics=$(date +%s)
last_web_activity=$(date +%s)

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
    
    # Web activity collection (every 5 minutes)
    if [[ $((now - last_web_activity)) -ge 300 ]]; then
        local web_data
        web_data=$(collect_web_activity 2>/dev/null)
        if [[ -n "$web_data" ]]; then
            local body
            body="{\"agent_name\":\"$AGENT_NAME\",\"data\":$web_data}"
            invoke_secure_request "POST" "/functions/v1/submit-web-activity" "$body" 30 || true
        fi
        last_web_activity=$now
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
    
    # System Metrics (every 5 minutes)
    if [[ $((now - last_metrics)) -ge 300 ]]; then
        if send_system_metrics; then
            add_evidence "metrics_sent" "{\"auto\":true}" "" "" "debug"
        fi
        last_metrics=$now
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
