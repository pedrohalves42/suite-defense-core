/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent macOS Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-macos-v3.sh
 * Versao: v3.10.25-BLOCKED-WEBSITES
 */

export const AGENT_SCRIPT_MACOS_SH = `#!/usr/bin/env bash
# CyberShield Agent - macOS
# Version: v3.10.25-BLOCKED-WEBSITES (Full sync with Windows/Linux features)

set -euo pipefail

########################################
# PARAMETROS
########################################

SERVER_URL="\\\${SERVER_URL:-\\\${CYBERSHIELD_SERVER_URL:-}}"
AGENT_TOKEN="\\\${AGENT_TOKEN:-\\\${CYBERSHIELD_AGENT_TOKEN:-}}"
HMAC_SECRET="\\\${HMAC_SECRET:-\\\${CYBERSHIELD_HMAC_SECRET:-}}"
AGENT_NAME="\\\${AGENT_NAME:-\\\${CYBERSHIELD_AGENT_NAME:-\\\$(hostname -s)}}"
AGENT_VERSION="\\\${AGENT_VERSION:-\\\${CYBERSHIELD_AGENT_VERSION:-v3.10.25}}"

while [[ \\\$# -gt 0 ]]; do
  case "\\\$1" in
    --server-url) SERVER_URL="\\\$2"; shift 2;;
    --agent-token) AGENT_TOKEN="\\\$2"; shift 2;;
    --hmac-secret) HMAC_SECRET="\\\$2"; shift 2;;
    --agent-name) AGENT_NAME="\\\$2"; shift 2;;
    --agent-version) AGENT_VERSION="\\\$2"; shift 2;;
    *) echo "Parametro desconhecido: \\\$1" >&2; exit 1;;
  esac
done

if [[ -z "\\\$SERVER_URL" ]]; then echo "SERVER_URL nao definido" >&2; exit 1; fi
if [[ -z "\\\$AGENT_TOKEN" ]]; then echo "AGENT_TOKEN nao definido" >&2; exit 1; fi
if [[ -z "\\\$HMAC_SECRET" ]]; then echo "HMAC_SECRET nao definido" >&2; exit 1; fi

SERVER_URL="\\\${SERVER_URL%/}"

INSTALL_DIR="/Library/Application Support/CyberShield"
BLOCKED_WEBSITES_FILE="\\\$INSTALL_DIR/blocked_websites.json"

LOG_DIR="/Library/Logs/CyberShield"
LOG_FILE="\\\$LOG_DIR/agent.log"

mkdir -p "\\\$LOG_DIR" || true
mkdir -p "\\\$INSTALL_DIR" || true
touch "\\\$LOG_FILE" 2>/dev/null || true

log() {
  local level="\\\$1"; shift
  local ts="\\\$(date '+%Y-%m-%d %H:%M:%S')"
  local line="[\\\$ts] [\\\$level] \\\$*"
  echo "\\\$line"
  echo "\\\$line" >> "\\\$LOG_FILE" 2>/dev/null || true
}

########################################
# HMAC
########################################

validate_hmac_secret() {
  if [[ ! "\\\$HMAC_SECRET" =~ ^[0-9a-fA-F]{64}\\\$ ]]; then
    log "ERROR" "HMAC_SECRET invalido"
    exit 1
  fi
}

hmac_sign() {
  local message="\\\$1"
  printf '%s' "\\\$message" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:\\\$HMAC_SECRET" | awk '{print \\\$2}'
}

########################################
# REQUISICAO SEGURA
########################################

SECURE_RESP_STATUS=""
SECURE_RESP_BODY=""

secure_request() {
  local path="\\\$1" method="\\\$2" body="\\\${3:-}" timeout_sec="\\\${4:-30}" max_retries="\\\${5:-3}"
  local url="\\\${SERVER_URL}\\\${path}"
  local retry_count=0 retry_delay=2

  while true; do
    local timestamp=\\\$(( \\\$(date +%s) * 1000 ))
    local nonce="\\\$(uuidgen 2>/dev/null || echo "nonce-\\\$(date +%s)")"
    local payload="\\\${timestamp}:\\\${nonce}:\\\${body}"
    local signature="\\\$(hmac_sign "\\\$payload")"

    log "DEBUG" "Request \\\$method \\\$url"

    local raw="\\\$(curl -sS -X "\\\$method" \\\\
      -H "X-Agent-Token: \\\$AGENT_TOKEN" \\\\
      -H "X-HMAC-Signature: \\\$signature" \\\\
      -H "X-Timestamp: \\\$timestamp" \\\\
      -H "X-Nonce: \\\$nonce" \\\\
      -H "Content-Type: application/json" \\\\
      --max-time "\\\$timeout_sec" \\\\
      -w '\\\\n%{http_code}' \\\\
      \\\${body:+ -d "\\\$body"} "\\\$url")" || true

    local http_code="\\\$(printf '%s\\\\n' "\\\$raw" | tail -n1)"
    SECURE_RESP_BODY="\\\$(printf '%s\\\\n' "\\\$raw" | sed '\\\$d')"
    SECURE_RESP_STATUS="\\\$http_code"

    log "DEBUG" "Response \\\$http_code"

    if [[ "\\\$http_code" == "401" ]]; then log "ERROR" "Auth error (401)"; return 1; fi
    if [[ "\\\$http_code" -ge 200 && "\\\$http_code" -lt 300 ]]; then return 0; fi

    retry_count=\\\$((retry_count+1))
    if (( retry_count >= max_retries )); then log "ERROR" "Falha definitiva"; return 1; fi
    sleep "\\\$retry_delay"; retry_delay=\\\$((retry_delay * 2))
  done
}

########################################
# SYSTEM INFO / METRICS
########################################

system_info_json() {
  local os_name="\\\$(sw_vers -productName 2>/dev/null || echo "macOS")"
  local os_version="\\\$(sw_vers -productVersion 2>/dev/null || echo "unknown")"
  local hostname="\\\$(hostname -s)"
  local hw_model="\\\$(sysctl -n hw.model 2>/dev/null || echo "unknown")"
  local total_ram_gb="\\\$(echo "\\\$(sysctl -n hw.memsize 2>/dev/null || echo 0) / (1024^3)" | bc -l 2>/dev/null | awk '{printf "%.2f",\\\$1}')"

  jq -n --arg os_type "macos" --arg os_name "\\\$os_name" --arg os_version "\\\$os_version" \\\\
    --arg hostname "\\\$hostname" --arg hw_model "\\\$hw_model" --arg total_ram_gb "\\\$total_ram_gb" \\\\
    --arg agent_name "\\\$AGENT_NAME" --arg agent_version "\\\$AGENT_VERSION" \\\\
    '{os_type: \\\$os_type, os_name: \\\$os_name, os_version: \\\$os_version, hostname: \\\$hostname, hardware_model: \\\$hw_model, total_ram_gb: (\\\$total_ram_gb|tonumber), agent_name: \\\$agent_name, agent_version: \\\$agent_version}'
}

system_metrics_json() {
  local cpu_load="\\\$(uptime | awk -F'load averages:' '{print \\\$2}' 2>/dev/null | awk '{print \\\$1}' | tr -d ',')"
  cpu_load="\\\${cpu_load:-0}"

  local ram_used="\\\$(vm_stat | awk '/Pages active/ {gsub(/\\\\./, "", \\\$3); active=\\\$3} /Pages wired down/ {gsub(/\\\\./, "", \\\$4); wired=\\\$4} /Pages free/ {gsub(/\\\\./, "", \\\$3); free=\\\$3} /Pages speculative/ {gsub(/\\\\./, "", \\\$3); spec=\\\$3} END {total=active+wired+free+spec; used=active+wired; if(total>0) printf "%.2f", (used/total)*100; else print "0"}')"
  ram_used="\\\${ram_used:-0}"

  local disk_used="\\\$(df / | awk 'NR==2 {print \\\$5}' | sed 's/%//')"
  disk_used="\\\${disk_used:-0}"

  jq -n --arg cpu_load "\\\$cpu_load" --arg ram_used "\\\$ram_used" --arg disk_used "\\\$disk_used" \\\\
    '{cpu_load_percent: (\\\$cpu_load|tonumber), ram_used_percent: (\\\$ram_used|tonumber), disk_used_percent: (\\\$disk_used|tonumber)}'
}

send_system_metrics() {
  local cpu="\\\$1" mem="\\\$2" disk="\\\$3" host="\\\$4"
  local body="\\\$(jq -n --arg cpu "\\\$cpu" --arg mem "\\\$mem" --arg disk "\\\$disk" --arg host "\\\$host" \\\\
    '{cpu_usage_percent: (\\\$cpu|tonumber), memory_usage_percent: (\\\$mem|tonumber), disk_usage_percent: (\\\$disk|tonumber), hostname: \\\$host}')"
  log "INFO" "Enviando metricas..."
  secure_request "/functions/v1/submit-system-metrics" "POST" "\\\$body" 15 3 && log "SUCCESS" "Metricas enviadas" || log "WARN" "Falha metricas"
}

send_post_installation() {
  local sys_json="\\\$(system_info_json)" metrics_json="\\\$(system_metrics_json)"
  local body="\\\$(jq -n --arg agent_name "\\\$AGENT_NAME" --arg event_type "post_installation" --arg platform "macos" \\\\
    --arg agent_version "\\\$AGENT_VERSION" --argjson metadata "\\\$(jq -n --argjson sys "\\\$sys_json" '{os_name: \\\$sys.os_name, hostname: \\\$sys.hostname}')" \\\\
    '{agent_name: \\\$agent_name, event_type: \\\$event_type, platform: \\\$platform, agent_version: \\\$agent_version, success: true, metadata: \\\$metadata}')"
  log "INFO" "Enviando post_installation..."
  secure_request "/functions/v1/track-installation-event" "POST" "\\\$body" 20 2 || true
}

send_heartbeat() {
  local sys_json="\\\$(system_info_json)" metrics_json="\\\$(system_metrics_json)"
  local body="\\\$(jq -n --arg agent_name "\\\$AGENT_NAME" --arg platform "macos" --arg agent_version "\\\$AGENT_VERSION" \\\\
    --argjson sys "\\\$sys_json" --argjson metrics "\\\$metrics_json" \\\\
    '{agent_name: \\\$agent_name, platform: \\\$platform, os_name: \\\$sys.os_name, os_version: \\\$sys.os_version, hostname: \\\$sys.hostname, hardware_model: \\\$sys.hardware_model, agent_version: \\\$agent_version, metrics: \\\$metrics}')"
  log "INFO" "Enviando heartbeat..."
  secure_request "/functions/v1/heartbeat" "POST" "\\\$body" 15 3 && log "SUCCESS" "Heartbeat OK" || log "ERROR" "Heartbeat falhou"
}

submit_job_result() {
  local job_id="\\\$1" status="\\\$2" output_json="\\\$3" error_message="\\\${4:-""}" exec_time="\\\${5:-0}" started_at="\\\${6:-\\\$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
  local body="\\\$(jq -n --arg job_id "\\\$job_id" --arg status "\\\$status" --arg error_message "\\\$error_message" \\\\
    --arg exec_time "\\\$exec_time" --arg started_at "\\\$started_at" --argjson output "\\\$output_json" \\\\
    '{job_id: \\\$job_id, status: \\\$status, output: \\\$output, error_message: \\\$error_message, execution_time_seconds: (\\\$exec_time|tonumber), started_at: \\\$started_at}')"
  log "INFO" "Enviando resultado job \\\$job_id..."
  secure_request "/functions/v1/submit-job-result" "POST" "\\\$body" 30 3
}

########################################
# JOB HANDLERS
########################################

handle_sync_blocked_websites() {
  log "INFO" "sync_blocked_websites..."
  if ! secure_request "/functions/v1/get-blocked-websites" "GET" "" 30 3; then
    echo '{"success": false, "error": "fetch_failed"}'
    return 1
  fi
  local blocked_domains="\\\$SECURE_RESP_BODY"
  local domain_count=\\\$(printf '%s\\\\n' "\\\$blocked_domains" | jq 'length' 2>/dev/null || echo "0")
  printf '%s\\\\n' "\\\$blocked_domains" > "\\\$BLOCKED_WEBSITES_FILE"
  log "INFO" "Saved \\\$domain_count blocked domains"
  jq -n --arg count "\\\$domain_count" '{success: true, domains_synced: (\\\$count|tonumber)}'
}

handle_update_agent() {
  log "INFO" "update_agent..."
  if ! secure_request "/functions/v1/serve-agent-update" "GET" "" 60 3; then
    echo '{"success": false, "error": "fetch_failed"}'
    return 1
  fi
  
  local response="\\\$SECURE_RESP_BODY"
  local new_version=\\\$(printf '%s\\\\n' "\\\$response" | jq -r '.version // empty')
  local new_script=\\\$(printf '%s\\\\n' "\\\$response" | jq -r '.script_content // empty')
  local expected_sha256=\\\$(printf '%s\\\\n' "\\\$response" | jq -r '.sha256 // empty')
  
  if [[ -z "\\\$new_version" ]] || [[ "\\\$new_version" == "\\\$AGENT_VERSION" ]]; then
    echo '{"success": true, "message": "Already up to date"}'
    return 0
  fi
  
  local current_script_path="\\\$INSTALL_DIR/cybershield-agent-\\\$AGENT_NAME.sh"
  
  if [[ -n "\\\$expected_sha256" ]]; then
    local temp_script="/tmp/cybershield_update_\\\$\\\$.sh"
    printf '%s\\\\n' "\\\$new_script" > "\\\$temp_script"
    local actual_sha256=\\\$(shasum -a 256 "\\\$temp_script" | awk '{print \\\$1}')
    if [[ "\\\$actual_sha256" != "\\\$expected_sha256" ]]; then
      rm -f "\\\$temp_script"
      echo '{"success": false, "error": "SHA256 mismatch"}'
      return 1
    fi
    rm -f "\\\$temp_script"
  fi
  
  printf '%s\\\\n' "\\\$new_script" > "\\\$current_script_path"
  chmod +x "\\\$current_script_path"
  log "SUCCESS" "Updated to \\\$new_version"
  
  jq -n --arg old "\\\$AGENT_VERSION" --arg new "\\\$new_version" '{success: true, old_version: \\\$old, new_version: \\\$new}'
}

handle_collect_web_activity() {
  log "INFO" "collect_web_activity multi-user..."
  local items="[]" total=0
  
  for user_home in /Users/*; do
    [[ -d "\\\$user_home" ]] || continue
    local username=\\\$(basename "\\\$user_home")
    [[ "\\\$username" == "Shared" || "\\\$username" =~ ^_ ]] && continue
    
    local safari_history="\\\$user_home/Library/Safari/History.db"
    if [[ -f "\\\$safari_history" ]] && command -v sqlite3 >/dev/null 2>&1; then
      local temp_db="/tmp/safari_\\\$\\\$_\\\$(date +%s).db"
      cp "\\\$safari_history" "\\\$temp_db" 2>/dev/null || continue
      local urls=\\\$(sqlite3 "\\\$temp_db" "SELECT DISTINCT url FROM history_items LIMIT 50;" 2>/dev/null || echo "")
      rm -f "\\\$temp_db"
      while IFS= read -r url; do
        [[ -n "\\\$url" ]] || continue
        local domain=\\\$(echo "\\\$url" | awk -F/ '{print \\\$3}' | sed 's/^www\\\\.//')
        [[ -n "\\\$domain" ]] && items=\\\$(echo "\\\$items" | jq --arg d "\\\$domain" --arg s "safari_\\\$username" '. + [{domain: \\\$d, source: \\\$s}]') && total=\\\$((total+1))
      done <<< "\\\$urls"
    fi
  done
  
  local body=\\\$(jq -n --argjson items "\\\$items" '{items: \\\$items}')
  secure_request "/functions/v1/submit-web-activity" "POST" "\\\$body" 60 3 || true
  jq -n --arg count "\\\$total" '{success: true, domains_collected: (\\\$count|tonumber)}'
}

handle_software_inventory_collect() {
  log "INFO" "software_inventory_collect..."
  local items="[]" total=0
  
  for app in /Applications/*.app; do
    [[ -d "\\\$app" ]] || continue
    local name=\\\$(basename "\\\$app" .app)
    local version=\\\$(defaults read "\\\$app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")
    items=\\\$(echo "\\\$items" | jq --arg n "\\\$name" --arg v "\\\$version" '. + [{name: \\\$n, version: \\\$v}]')
    total=\\\$((total+1))
  done
  
  if command -v brew >/dev/null 2>&1; then
    while IFS= read -r line; do
      [[ -z "\\\$line" ]] && continue
      local pkg=\\\$(echo "\\\$line" | awk '{print \\\$1}')
      local ver=\\\$(echo "\\\$line" | awk '{print \\\$2}')
      items=\\\$(echo "\\\$items" | jq --arg n "\\\$pkg" --arg v "\\\$ver" '. + [{name: \\\$n, version: \\\$v}]')
      total=\\\$((total+1))
    done < <(brew list --versions 2>/dev/null)
  fi
  
  local body=\\\$(jq -n --argjson items "\\\$items" '{items: \\\$items}')
  secure_request "/functions/v1/submit-software-inventory" "POST" "\\\$body" 60 3 || true
  jq -n --arg count "\\\$total" '{success: true, software_count: (\\\$count|tonumber)}'
}

handle_collect_antivirus_status() {
  log "INFO" "collect_antivirus_status..."
  local items="[]"
  
  local xp_ver="unknown"
  [[ -f "/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/version.plist" ]] && \\\\
    xp_ver=\\\$(defaults read "/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/version.plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")
  items=\\\$(echo "\\\$items" | jq --arg name "XProtect" --arg ver "\\\$xp_ver" --arg status "active" '. + [{engine_name: \\\$name, engine_version: \\\$ver, status: \\\$status}]')
  
  local gk_status=\\\$(spctl --status 2>/dev/null || echo "unknown")
  local gk_enabled="disabled"; [[ "\\\$gk_status" == *"enabled"* ]] && gk_enabled="enabled"
  items=\\\$(echo "\\\$items" | jq --arg name "Gatekeeper" --arg status "\\\$gk_enabled" '. + [{engine_name: \\\$name, engine_version: "N/A", status: \\\$status}]')
  
  local body=\\\$(jq -n --argjson items "\\\$items" '{items: \\\$items}')
  secure_request "/functions/v1/submit-antivirus-status" "POST" "\\\$body" 30 3 || true
  jq -n --argjson items "\\\$items" '{success: true, engines_checked: (\\\$items|length)}'
}

handle_fix_firewall() {
  log "INFO" "fix_firewall..."
  local firewall_tool="/usr/libexec/ApplicationFirewall/socketfilterfw"
  sudo "\\\$firewall_tool" --setglobalstate on 2>/dev/null || true
  sudo "\\\$firewall_tool" --setstealthmode on 2>/dev/null || true
  log "SUCCESS" "Firewall enabled"
  jq -n '{success: true, changes_made: ["Enabled firewall", "Enabled stealth mode"]}'
}

handle_restart_service() {
  local service_name=\\\$(printf '%s\\\\n' "\\\$1" | jq -r '.service_name // empty')
  if [[ -z "\\\$service_name" ]]; then echo '{"success": false, "error": "service_name not provided"}'; return 1; fi
  log "INFO" "restart_service: \\\$service_name"
  
  local plist="/Library/LaunchDaemons/\\\${service_name}.plist"
  if [[ -f "\\\$plist" ]]; then
    sudo launchctl unload "\\\$plist" 2>/dev/null || true
    sleep 1
    sudo launchctl load "\\\$plist" 2>/dev/null
    jq -n --arg svc "\\\$service_name" '{success: true, service: \\\$svc}'
    return 0
  fi
  jq -n --arg svc "\\\$service_name" '{success: false, error: "Service not found"}'
}

handle_collect_network_info() {
  log "INFO" "collect_network_info..."
  local gateway=\\\$(netstat -rn | awk '/default/ {print \\\$2; exit}')
  local dns_servers=\\\$(scutil --dns 2>/dev/null | grep 'nameserver\\\\[' | awk '{print \\\$3}' | head -5 | jq -R -s -c 'split("\\\\n") | map(select(length > 0))')
  local public_ip=\\\$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "unknown")
  local fw_enabled="false"
  [[ "\\\$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null)" == *"enabled"* ]] && fw_enabled="true"
  
  local body=\\\$(jq -n --arg gw "\\\$gateway" --argjson dns "\\\$dns_servers" --arg ip "\\\$public_ip" --arg fw "\\\$fw_enabled" \\\\
    '{gateway_ip: \\\$gw, dns_servers: \\\$dns, public_ip: \\\$ip, firewall_public: (\\\$fw=="true")}')
  secure_request "/functions/v1/submit-network-info" "POST" "\\\$body" 30 3 || true
  printf '%s\\\\n' "\\\$body" | jq '. + {success: true}'
}

handle_light_vuln_scan() {
  log "INFO" "light_vuln_scan..."
  local findings="[]"
  
  local sip_status=\\\$(csrutil status 2>/dev/null || echo "unknown")
  [[ "\\\$sip_status" == *"disabled"* ]] && findings=\\\$(echo "\\\$findings" | jq '. + [{severity: "critical", title: "SIP Disabled"}]')
  
  local gk=\\\$(spctl --status 2>/dev/null || echo "unknown")
  [[ "\\\$gk" == *"disabled"* ]] && findings=\\\$(echo "\\\$findings" | jq '. + [{severity: "high", title: "Gatekeeper Disabled"}]')
  
  local fv=\\\$(fdesetup status 2>/dev/null || echo "unknown")
  [[ "\\\$fv" == *"Off"* ]] && findings=\\\$(echo "\\\$findings" | jq '. + [{severity: "medium", title: "FileVault Disabled"}]')
  
  local count=\\\$(echo "\\\$findings" | jq 'length')
  local body=\\\$(jq -n --argjson findings "\\\$findings" '{findings: \\\$findings}')
  secure_request "/functions/v1/submit-vuln-findings" "POST" "\\\$body" 30 3 || true
  jq -n --argjson findings "\\\$findings" '{success: true, findings_count: (\\\$findings|length), findings: \\\$findings}'
}

########################################
# EXECUTE JOB
########################################

execute_job() {
  local job_id="\\\$1" job_type="\\\$2" payload_json="\\\$3" job_agent_id="\\\${4:-}"
  log "INFO" "Executando job \\\$job_id (type=\\\$job_type)"
  
  local started_at=\\\$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  local start_ts=\\\$(date +%s)
  local output_json status="completed" error_msg=""

  case "\\\$job_type" in
    integration_test|collect_info|report)
      local sys="\\\$(system_info_json)" metrics="\\\$(system_metrics_json)"
      output_json="\\\$(jq -n --argjson sys "\\\$sys" --argjson metrics "\\\$metrics" '{system: \\\$sys, metrics: \\\$metrics}')"
      ;;
    sync_blocked_websites) output_json="\\\$(handle_sync_blocked_websites "\\\$payload_json")" ;;
    update_agent) output_json="\\\$(handle_update_agent "\\\$payload_json")" ;;
    collect_web_activity) output_json="\\\$(handle_collect_web_activity "\\\$payload_json")" ;;
    software_inventory_collect) output_json="\\\$(handle_software_inventory_collect "\\\$payload_json")" ;;
    collect_antivirus_status) output_json="\\\$(handle_collect_antivirus_status "\\\$payload_json")" ;;
    fix_firewall) output_json="\\\$(handle_fix_firewall "\\\$payload_json")" ;;
    restart_service) output_json="\\\$(handle_restart_service "\\\$payload_json")" ;;
    collect_network_info) output_json="\\\$(handle_collect_network_info "\\\$payload_json")" ;;
    light_vuln_scan) output_json="\\\$(handle_light_vuln_scan "\\\$payload_json")" ;;
    *)
      status="failed"
      error_msg="Tipo de job nao suportado: \\\$job_type"
      output_json="\\\$(jq -n --arg error "\\\$error_msg" '{error: \\\$error}')"
      ;;
  esac

  local job_success=\\\$(printf '%s\\\\n' "\\\$output_json" | jq -r '.success // true')
  if [[ "\\\$job_success" == "false" ]]; then
    status="failed"
    error_msg=\\\$(printf '%s\\\\n' "\\\$output_json" | jq -r '.error // "Unknown error"')
  fi

  local end_ts=\\\$(date +%s)
  local exec_time=\\\$(( end_ts - start_ts ))
  submit_job_result "\\\$job_id" "\\\$status" "\\\$output_json" "\\\$error_msg" "\\\$exec_time" "\\\$started_at"
}

########################################
# POLL JOBS
########################################

poll_jobs() {
  local body="\\\$(jq -n --arg agent_name "\\\$AGENT_NAME" --arg agent_version "\\\$AGENT_VERSION" '{agent_name: \\\$agent_name, agent_version: \\\$agent_version}')"
  log "INFO" "Consultando jobs..."
  if ! secure_request "/functions/v1/poll-jobs" "POST" "\\\$body" 20 3; then log "ERROR" "poll-jobs falhou"; return; fi
  [[ -z "\\\$SECURE_RESP_BODY" ]] && return

  local jobs_json="\\\$SECURE_RESP_BODY"
  local count=\\\$(printf '%s\\\\n' "\\\$jobs_json" | jq 'length' 2>/dev/null) || return
  [[ "\\\$count" -eq 0 ]] && { log "INFO" "Nenhum job"; return; }

  log "INFO" "Recebidos \\\$count job(s)"
  printf '%s\\\\n' "\\\$jobs_json" | jq -c '.[]' | while read -r job; do
    local job_id=\\\$(printf '%s\\\\n' "\\\$job" | jq -r '.id')
    local job_type=\\\$(printf '%s\\\\n' "\\\$job" | jq -r '.type')
    local payload_json=\\\$(printf '%s\\\\n' "\\\$job" | jq -c '.payload // {}')
    local job_agent_id=\\\$(printf '%s\\\\n' "\\\$job" | jq -r '.agent_id // empty')
    execute_job "\\\$job_id" "\\\$job_type" "\\\$payload_json" "\\\$job_agent_id"
  done
}

check_for_updates() {
  log "INFO" "Checking for updates..."
  local body="\\\$(jq -n --arg agent_version "\\\$AGENT_VERSION" --arg platform "macos" '{agent_version: \\\$agent_version, platform: \\\$platform}')"
  secure_request "/functions/v1/check-agent-updates" "POST" "\\\$body" 30 2 || return
  local update_available=\\\$(printf '%s\\\\n' "\\\$SECURE_RESP_BODY" | jq -r '.update_available // false')
  [[ "\\\$update_available" == "true" ]] && log "INFO" "Update available" || log "INFO" "Already up to date"
}

########################################
# MAIN LOOP
########################################

main() {
  validate_hmac_secret

  local heartbeat_interval=30 poll_interval=30 metrics_interval=300 update_check_interval=86400

  log "INFO" "============================================"
  log "INFO" "Iniciando CyberShield Agent - macOS \\\$AGENT_VERSION"
  log "INFO" "ServerUrl = \\\$SERVER_URL"
  log "INFO" "AgentName = \\\$AGENT_NAME"

  send_post_installation
  send_heartbeat

  log "INFO" "Entrando no loop principal"

  local last_hb=\\\$(date +%s) last_poll=\\\$(date +%s) last_metrics=\\\$(date +%s) last_update_check=\\\$(date +%s) now

  while true; do
    now=\\\$(date +%s)
    (( now - last_hb >= heartbeat_interval )) && { send_heartbeat; last_hb=\\\$(date +%s); }
    (( now - last_poll >= poll_interval )) && { poll_jobs; last_poll=\\\$(date +%s); }

    if (( now - last_metrics >= metrics_interval )); then
      local metrics_json="\\\$(system_metrics_json)" sys_json="\\\$(system_info_json)"
      local cpu_p=\\\$(printf '%s\\\\n' "\\\$metrics_json" | jq -r '.cpu_load_percent')
      local mem_p=\\\$(printf '%s\\\\n' "\\\$metrics_json" | jq -r '.ram_used_percent')
      local disk_p=\\\$(printf '%s\\\\n' "\\\$metrics_json" | jq -r '.disk_used_percent')
      local host=\\\$(printf '%s\\\\n' "\\\$sys_json" | jq -r '.hostname')
      send_system_metrics "\\\$cpu_p" "\\\$mem_p" "\\\$disk_p" "\\\$host" || true
      last_metrics=\\\$(date +%s)
    fi

    (( now - last_update_check >= update_check_interval )) && { check_for_updates; last_update_check=\\\$(date +%s); }
    sleep 2
  done
}

main "\\\$@"
`;

export function getAgentScriptMacos(): string {
  return AGENT_SCRIPT_MACOS_SH;
}
