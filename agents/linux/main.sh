#!/usr/bin/env bash
#
# CyberShield Agent - Linux v6.0 Entrypoint
# Platform-specific wrappers around shared lib.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ============================================
#  PLATFORM PATHS
# ============================================
BASE_DIR="/opt/cybershield"
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

# Source shared library
source "$SCRIPT_DIR/../unix/lib.sh"

# Trap: flush log on exit
trap 'flush_log_buffer' EXIT TERM INT

# ============================================
#  PLATFORM-SPECIFIC IMPLEMENTATIONS
# ============================================
_stat_size() { stat -c%s "$1" 2>/dev/null || echo 0; }

_generate_uuid() {
    cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N
}

_list_process_names() { ps -eo comm= | sort -u; }

_get_cpu_percent() {
    awk '{u=$2+$4; t=$2+$4+$5; if(t>0) printf "%.0f", u*100/t; else print "0"}' /proc/stat 2>/dev/null | head -1 || echo 0
}

_get_system_metrics() {
    local cpu_percent mem_total mem_free mem_used mem_percent
    cpu_percent=$(_get_cpu_percent)
    mem_total=$(awk '/MemTotal/ {print $2 * 1024}' /proc/meminfo 2>/dev/null || echo 0)
    mem_free=$(awk '/MemAvailable/ {print $2 * 1024}' /proc/meminfo 2>/dev/null || echo 0)
    mem_used=$((mem_total - mem_free))
    mem_percent=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc 2>/dev/null || echo 0)

    local disk_info disk_total disk_used disk_percent uptime_seconds
    disk_info=$(df / | tail -1)
    disk_total=$(echo "$disk_info" | awk '{print $2}')
    disk_percent=$(echo "$disk_info" | awk '{print $5}' | tr -d '%')
    uptime_seconds=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)

    echo '{"cpu_percent":'"$cpu_percent"',"memory_total_gb":'$(echo "scale=2; $mem_total / 1073741824" | bc 2>/dev/null || echo 0)',"memory_used_percent":'"$mem_percent"',"disk_used_percent":'"$disk_percent"',"uptime_seconds":'"$uptime_seconds"'}'
}

_get_top_processes() {
    local top_cpu top_mem total
    top_cpu=$(ps aux --sort=-%cpu | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
    top_mem=$(ps aux --sort=-%mem | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
    total=$(ps aux | wc -l)
    echo '{"top_by_cpu":['"$top_cpu"'],"top_by_memory":['"$top_mem"'],"total_processes":'"$total"'}'
}

_check_service_health() {
    # Check systemd service health
    local service_name=""
    for pattern in "cybershield-agent" "cybershield"; do
        if systemctl list-units --type=service --all 2>/dev/null | grep -q "$pattern"; then
            service_name="$pattern"; break
        fi
    done
    [[ -z "$service_name" ]] && return 0

    local is_active is_enabled
    is_active=$(systemctl is-active "$service_name" 2>/dev/null || echo "unknown")
    is_enabled=$(systemctl is-enabled "$service_name" 2>/dev/null || echo "unknown")

    if [[ "$is_active" != "active" ]]; then
        systemctl start "$service_name" 2>/dev/null && log "SUCCESS" "[SERVICE] Restarted $service_name"
    fi
    if [[ "$is_enabled" != "enabled" ]]; then
        systemctl enable "$service_name" 2>/dev/null && log "SUCCESS" "[SERVICE] Re-enabled $service_name"
    fi
}

_auto_repair() {
    # Disk cleanup
    local disk_usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
    if [[ "$disk_usage" -ge "$DISK_CLEANUP_THRESHOLD" ]]; then
        find /tmp -type f -mtime +7 -delete 2>/dev/null || true
        find /var/tmp -type f -mtime +7 -delete 2>/dev/null || true
        command -v journalctl &>/dev/null && journalctl --vacuum-time=7d 2>/dev/null || true
        command -v apt-get &>/dev/null && apt-get clean 2>/dev/null || true
        AUTO_REPAIR_DISK_CLEANUPS=$((AUTO_REPAIR_DISK_CLEANUPS + 1))
    fi
}

_apply_forced_update() {
    local response="$1"
    local target_version base64_content expected_hash
    target_version=$(echo "$response" | jq -r '.target_version // ""' 2>/dev/null)
    base64_content=$(echo "$response" | jq -r '.script_content_base64 // ""' 2>/dev/null)
    expected_hash=$(echo "$response" | jq -r '.sha256 // ""' 2>/dev/null)

    [[ -z "$target_version" || -z "$base64_content" || -z "$expected_hash" ]] && return 1

    local temp_script="/tmp/cybershield-force-update-${target_version}.sh"
    echo "$base64_content" | base64 -d > "$temp_script" 2>/dev/null
    [[ ! -s "$temp_script" ]] && { rm -f "$temp_script"; return 1; }

    local actual_hash
    actual_hash=$(sha256sum "$temp_script" | awk '{print $1}')
    [[ "${actual_hash,,}" != "${expected_hash,,}" ]] && { rm -f "$temp_script"; return 1; }

    local current_script
    current_script=$(readlink -f "$0" 2>/dev/null || echo "$0")
    [[ -f "$current_script" ]] && cp "$current_script" "${current_script}.backup" 2>/dev/null
    chmod +x "$temp_script"
    cp "$temp_script" "$current_script" 2>/dev/null
    rm -f "$temp_script"

    if systemctl is-active cybershield-agent &>/dev/null; then
        sudo systemctl restart cybershield-agent &
    else
        exec "$current_script" --server-url "$SERVER_URL" --agent-token "$AGENT_TOKEN" --hmac-secret "$HMAC_SECRET" --agent-name "$AGENT_NAME" &
    fi
    exit 0
}

_dispatch_job() {
    local job_type="$1" job="$2"
    source "$SCRIPT_DIR/modules/handlers.sh"
    dispatch_job_handler "$job_type" "$job"
}

# ============================================
#  PROTECTED LISTS
# ============================================
PROTECTED_PROCESSES="init systemd journald sshd cron dbus NetworkManager systemd-logind systemd-udevd polkitd"
PROTECTED_SERVICES="sshd dbus NetworkManager systemd-journald systemd-logind systemd-udevd polkit cron rsyslog auditd firewalld"

# ============================================
#  LAUNCH
# ============================================
run_main_loop
