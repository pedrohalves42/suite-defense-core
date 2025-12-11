#!/usr/bin/env bash
# CyberShield Agent - macOS
# Version: v3.10.33-MACOS-SYNC

set -euo pipefail

########################################
# PARAMETROS
########################################

# Prioridade: argumentos > env vars curtas > env vars prefixadas CYBERSHIELD_*
SERVER_URL="${SERVER_URL:-${CYBERSHIELD_SERVER_URL:-}}"
AGENT_TOKEN="${AGENT_TOKEN:-${CYBERSHIELD_AGENT_TOKEN:-}}"
HMAC_SECRET="${HMAC_SECRET:-${CYBERSHIELD_HMAC_SECRET:-}}"
AGENT_NAME="${AGENT_NAME:-${CYBERSHIELD_AGENT_NAME:-$(hostname -s)}}"
AGENT_VERSION="${AGENT_VERSION:-${CYBERSHIELD_AGENT_VERSION:-v3.10.33}}"

# Parse argumentos (sobrescreve env vars)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-url)
      SERVER_URL="$2"; shift 2;;
    --agent-token)
      AGENT_TOKEN="$2"; shift 2;;
    --hmac-secret)
      HMAC_SECRET="$2"; shift 2;;
    --agent-name)
      AGENT_NAME="$2"; shift 2;;
    --agent-version)
      AGENT_VERSION="$2"; shift 2;;
    *)
      echo "Parametro desconhecido: $1" >&2
      echo "Uso: $0 --server-url URL --agent-token TOKEN --hmac-secret SECRET [--agent-name NAME] [--agent-version VERSION]"
      exit 1;;
  esac
done

# Validacao com mensagens claras
if [[ -z "$SERVER_URL" ]]; then
  echo "SERVER_URL nao definido" >&2
  echo "Use: --server-url URL" >&2
  echo "  ou: SERVER_URL=... (env var)" >&2
  echo "  ou: CYBERSHIELD_SERVER_URL=... (env var prefixada)" >&2
  exit 1
fi

if [[ -z "$AGENT_TOKEN" ]]; then
  echo "AGENT_TOKEN nao definido" >&2
  echo "Use: --agent-token TOKEN ou AGENT_TOKEN=... ou CYBERSHIELD_AGENT_TOKEN=..." >&2
  exit 1
fi

if [[ -z "$HMAC_SECRET" ]]; then
  echo "HMAC_SECRET nao definido" >&2
  echo "Use: --hmac-secret SECRET ou HMAC_SECRET=... ou CYBERSHIELD_HMAC_SECRET=..." >&2
  exit 1
fi

SERVER_URL="${SERVER_URL%/}"

########################################
# DIRETÓRIOS DE INSTALAÇÃO
########################################

INSTALL_DIR="/Library/Application Support/CyberShield"
BLOCKED_WEBSITES_FILE="$INSTALL_DIR/blocked_websites.json"

########################################
# LOG
########################################

LOG_DIR="/Library/Logs/CyberShield"
LOG_FILE="$LOG_DIR/agent.log"

mkdir -p "$LOG_DIR" || true
mkdir -p "$INSTALL_DIR" || true
touch "$LOG_FILE" 2>/dev/null || true

log() {
  local level="$1"; shift
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  local line="[$ts] [$level] $*"
  echo "$line"
  echo "$line" >> "$LOG_FILE" 2>/dev/null || true
}

########################################
# HMAC (HEX)
########################################

validate_hmac_secret() {
  if [[ ! "$HMAC_SECRET" =~ ^[0-9a-fA-F]{64}$ ]]; then
    log "ERROR" "HMAC_SECRET invalido. Esperado 64 caracteres hexadecimais, recebido length=${#HMAC_SECRET}"
    exit 1
  fi
}

hmac_sign() {
  local message="$1"
  # macOS tambem usa openssl com hexkey
  printf '%s' "$message" \
    | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$HMAC_SECRET" \
    | awk '{print $2}'
}

########################################
# REQUISICAO SEGURA
########################################

SECURE_RESP_STATUS=""
SECURE_RESP_BODY=""

secure_request() {
  local path="$1"
  local method="$2"
  local body="${3:-}"
  local timeout_sec="${4:-30}"
  local max_retries="${5:-3}"

  local url="${SERVER_URL}${path}"
  local retry_count=0
  local retry_delay=2

  while true; do
    local timestamp nonce payload signature http_code raw
    # macOS date nao tem %3N -> usar segundos * 1000
    timestamp=$(( $(date +%s) * 1000 ))

    if command -v uuidgen >/dev/null 2>&1; then
      nonce="$(uuidgen)"
    else
      nonce="nonce-$(date +%s)"
    fi

    payload="${timestamp}:${nonce}:${body}"
    signature="$(hmac_sign "$payload")"

    log "DEBUG" "Request $method $url (body_length=${#body})"

    raw="$(
      curl -sS \
        -X "$method" \
        -H "X-Agent-Token: $AGENT_TOKEN" \
        -H "X-HMAC-Signature: $signature" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Nonce: $nonce" \
        -H "Content-Type: application/json" \
        --max-time "$timeout_sec" \
        -w '\n%{http_code}' \
        ${body:+ -d "$body"} \
        "$url"
    )" || true

    http_code="$(printf '%s\n' "$raw" | tail -n1)"
    SECURE_RESP_BODY="$(printf '%s\n' "$raw" | sed '$d')"
    SECURE_RESP_STATUS="$http_code"

    log "DEBUG" "Response $http_code from $url"

    if [[ "$http_code" == "401" ]]; then
      log "ERROR" "Erro de autenticacao (401). Verifique AgentToken / HmacSecret / clock."
      return 1
    fi

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
      return 0
    fi

    retry_count=$((retry_count+1))
    if (( retry_count >= max_retries )); then
      log "ERROR" "Falha definitiva apos $max_retries tentativas em $url (status=$http_code)"
      return 1
    fi

    log "WARN" "Tentativa $retry_count falhou (status=$http_code). Aguardando ${retry_delay}s..."
    sleep "$retry_delay"
    retry_delay=$((retry_delay * 2))
  done
}

########################################
# SYSTEM INFO / METRICS
########################################

system_info_json() {
  local os_name os_version hostname hw_model total_ram_gb

  os_name="$(sw_vers -productName 2>/dev/null || echo "macOS")"
  os_version="$(sw_vers -productVersion 2>/dev/null || echo "unknown")"
  hostname="$(hostname -s)"
  hw_model="$(sysctl -n hw.model 2>/dev/null || echo "unknown")"
  total_ram_gb="$(echo "$(sysctl -n hw.memsize 2>/dev/null || echo 0) / (1024^3)" | bc -l 2>/dev/null | awk '{printf "%.2f",$1}')"

  jq -n \
    --arg os_type "macos" \
    --arg os_name "$os_name" \
    --arg os_version "$os_version" \
    --arg hostname "$hostname" \
    --arg hw_model "$hw_model" \
    --arg total_ram_gb "$total_ram_gb" \
    --arg agent_name "$AGENT_NAME" \
    --arg agent_version "$AGENT_VERSION" \
    '{
      os_type: $os_type,
      os_name: $os_name,
      os_version: $os_version,
      hostname: $hostname,
      hardware_model: $hw_model,
      total_ram_gb: ($total_ram_gb|tonumber),
      agent_name: $agent_name,
      agent_version: $agent_version
    }'
}

system_metrics_json() {
  local cpu_load ram_used disk_used uptime_seconds last_boot_time

  # CPU load medio (1 minuto) - usar "uptime"
  cpu_load="$(uptime | awk -F'load averages:' '{print $2}' 2>/dev/null | awk '{print $1}' | tr -d ',')"
  cpu_load="${cpu_load:-0}"

  # RAM usada (%) - macOS: usar vm_stat para calcular uso real
  ram_used="$(vm_stat | awk '
    /Pages active/ {gsub(/\./, "", $3); active=$3}
    /Pages wired down/ {gsub(/\./, "", $4); wired=$4}
    /Pages free/ {gsub(/\./, "", $3); free=$3}
    /Pages speculative/ {gsub(/\./, "", $3); spec=$3}
    END {
      page_size = 4096
      total_pages = active + wired + free + spec
      used_pages = active + wired
      if (total_pages > 0) {
        printf "%.2f", (used_pages / total_pages) * 100
      } else {
        print "0"
      }
    }')"
  ram_used="${ram_used:-0}"

  # DISCO (%)
  disk_used="$(df / | awk 'NR==2 {print $5}' | sed 's/%//')"
  disk_used="${disk_used:-0}"

  # UPTIME - tempo desde ultimo boot via sysctl
  local boot_epoch current_epoch
  boot_epoch="$(sysctl -n kern.boottime 2>/dev/null | awk -F'sec = ' '{print $2}' | awk -F',' '{print $1}')"
  boot_epoch="${boot_epoch:-0}"
  current_epoch="$(date +%s)"
  uptime_seconds=$((current_epoch - boot_epoch))
  
  # Formatar boot time ISO
  last_boot_time="$(date -r "$boot_epoch" -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "")"

  jq -n \
    --arg cpu_load "$cpu_load" \
    --arg ram_used "$ram_used" \
    --arg disk_used "$disk_used" \
    --arg uptime_seconds "$uptime_seconds" \
    --arg last_boot_time "$last_boot_time" \
    '{
      cpu_load_percent: ($cpu_load|tonumber),
      ram_used_percent: ($ram_used|tonumber),
      disk_used_percent: ($disk_used|tonumber),
      uptime_seconds: ($uptime_seconds|tonumber),
      last_boot_time: $last_boot_time
    }'
}

########################################
# SEND SYSTEM METRICS
########################################

send_system_metrics() {
  local cpu_usage_percent="$1"
  local memory_usage_percent="$2"
  local disk_usage_percent="$3"
  local hostname="$4"
  local uptime_seconds="${5:-0}"
  local last_boot_time="${6:-}"
  
  local body
  body="$(jq -n \
    --arg cpu "$cpu_usage_percent" \
    --arg mem "$memory_usage_percent" \
    --arg disk "$disk_usage_percent" \
    --arg host "$hostname" \
    --arg uptime "$uptime_seconds" \
    --arg boot "$last_boot_time" \
    '{
      cpu_usage_percent: ($cpu|tonumber),
      memory_usage_percent: ($mem|tonumber),
      disk_usage_percent: ($disk|tonumber),
      hostname: $host,
      uptime_seconds: ($uptime|tonumber),
      last_boot_time: $boot
    }'
  )"
  
  log "INFO" "Enviando metricas de sistema..."
  if secure_request "/functions/v1/submit-system-metrics" "POST" "$body" 15 3; then
    log "SUCCESS" "Metricas enviadas com sucesso"
    return 0
  else
    log "WARN" "Falha ao enviar metricas (status=$SECURE_RESP_STATUS)"
    return 1
  fi
}

########################################
# POST INSTALLATION
########################################

send_post_installation() {
  local success="${1:-true}"
  local error_message="${2:-""}"
  local install_time="${3:-0}"

  local sys_json metrics_json body
  sys_json="$(system_info_json)"
  metrics_json="$(system_metrics_json)"

  body="$(
    jq -n \
      --arg agent_name "$AGENT_NAME" \
      --arg event_type "$( [[ "$success" == "true" ]] && echo "post_installation" || echo "post_installation_unverified" )" \
      --arg platform "macos" \
      --arg installation_method "one_click" \
      --arg success_b "$success" \
      --arg error_message "$error_message" \
      --arg agent_version "$AGENT_VERSION" \
      --arg install_time "$install_time" \
      --argjson metadata "$(
        jq -n \
          --argjson sys "$sys_json" \
          --argjson metrics "$metrics_json" \
          '{
            os_name: $sys.os_name,
            os_version: $sys.os_version,
            hostname: $sys.hostname,
            hardware_model: $sys.hardware_model,
            total_ram_gb: $sys.total_ram_gb,
            cpu_load: $metrics.cpu_load_percent,
            ram_used: $metrics.ram_used_percent,
            disk_used: $metrics.disk_used_percent
          }'
      )" \
      '{
        agent_name: $agent_name,
        event_type: $event_type,
        platform: $platform,
        installation_method: $installation_method,
        success: ($success_b=="true"),
        installation_time_seconds: ($install_time|tonumber),
        error_message: $error_message,
        agent_version: $agent_version,
        network_connectivity: true,
        metadata: $metadata
      }'
  )"

  log "INFO" "Enviando post_installation..."
  if secure_request "/functions/v1/track-installation-event" "POST" "$body" 20 2; then
    log "SUCCESS" "post_installation enviado com sucesso"
  else
    log "WARN" "Falha ao enviar post_installation (status=$SECURE_RESP_STATUS)"
  fi
}

########################################
# HEARTBEAT
########################################

send_heartbeat() {
  local sys_json metrics_json body
  sys_json="$(system_info_json)"
  metrics_json="$(system_metrics_json)"

  body="$(
    jq -n \
      --arg agent_name "$AGENT_NAME" \
      --arg platform "macos" \
      --arg agent_version "$AGENT_VERSION" \
      --argjson sys "$sys_json" \
      --argjson metrics "$metrics_json" \
      '{
        agent_name: $agent_name,
        platform: $platform,
        os_name: $sys.os_name,
        os_version: $sys.os_version,
        hostname: $sys.hostname,
        hardware_model: $sys.hardware_model,
        agent_version: $agent_version,
        metrics: $metrics
      }'
  )"

  log "INFO" "Enviando heartbeat..."
  if secure_request "/functions/v1/heartbeat" "POST" "$body" 15 3; then
    log "SUCCESS" "Heartbeat OK ($SECURE_RESP_STATUS)"
  else
    log "ERROR" "Heartbeat falhou (status=$SECURE_RESP_STATUS)"
  fi
}

########################################
# SUBMIT JOB RESULT
########################################

submit_job_result() {
  local job_id="$1"
  local status="$2"
  local output_json="$3"
  local error_message="${4:-""}"
  local exec_time="${5:-0}"
  local started_at="${6:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

  local body
  body="$(
    jq -n \
      --arg job_id "$job_id" \
      --arg status "$status" \
      --arg error_message "$error_message" \
      --arg exec_time "$exec_time" \
      --arg started_at "$started_at" \
      --argjson output "$output_json" \
      '{
        job_id: $job_id,
        status: $status,
        output: $output,
        error_message: $error_message,
        execution_time_seconds: ($exec_time|tonumber),
        started_at: $started_at
      }'
  )"

  log "INFO" "Enviando resultado do job $job_id (status=$status)..."
  if secure_request "/functions/v1/submit-job-result" "POST" "$body" 30 3; then
    log "SUCCESS" "Resultado do job $job_id enviado com sucesso"
    return 0
  else
    log "ERROR" "Falha ao enviar resultado do job $job_id (status=$SECURE_RESP_STATUS)"
    return 1
  fi
}

########################################
# JOB HANDLERS
########################################

# Handler: sync_blocked_websites
handle_sync_blocked_websites() {
  local payload_json="$1"
  local apply_to_hosts="${2:-false}"
  
  log "INFO" "Executando sync_blocked_websites..."
  
  # Buscar lista de websites bloqueados do servidor
  if ! secure_request "/functions/v1/get-blocked-websites" "GET" "" 30 3; then
    echo '{"success": false, "error": "Failed to fetch blocked websites"}'
    return 1
  fi
  
  local blocked_domains="$SECURE_RESP_BODY"
  local domain_count
  domain_count="$(printf '%s\n' "$blocked_domains" | jq 'length' 2>/dev/null || echo "0")"
  
  # Salvar lista localmente
  printf '%s\n' "$blocked_domains" > "$BLOCKED_WEBSITES_FILE"
  log "INFO" "Saved $domain_count blocked domains to $BLOCKED_WEBSITES_FILE"
  
  # Aplicar ao hosts file se solicitado
  apply_to_hosts="$(printf '%s\n' "$payload_json" | jq -r '.apply_to_hosts // false')"
  
  if [[ "$apply_to_hosts" == "true" ]]; then
    local hosts_file="/etc/hosts"
    local marker_start="# BEGIN CYBERSHIELD BLOCKED"
    local marker_end="# END CYBERSHIELD BLOCKED"
    
    # Remover entradas antigas do CyberShield
    if grep -q "$marker_start" "$hosts_file" 2>/dev/null; then
      sudo sed -i.bak "/$marker_start/,/$marker_end/d" "$hosts_file"
    fi
    
    # Adicionar novas entradas
    {
      echo "$marker_start"
      printf '%s\n' "$blocked_domains" | jq -r '.[]' 2>/dev/null | while read -r domain; do
        [[ -n "$domain" ]] && echo "127.0.0.1 $domain"
      done
      echo "$marker_end"
    } | sudo tee -a "$hosts_file" >/dev/null
    
    # Flush DNS cache
    sudo dscacheutil -flushcache 2>/dev/null || true
    sudo killall -HUP mDNSResponder 2>/dev/null || true
    
    log "SUCCESS" "Applied $domain_count domains to hosts file and flushed DNS"
  fi
  
  jq -n \
    --arg domain_count "$domain_count" \
    --arg applied "$apply_to_hosts" \
    '{
      success: true,
      domains_synced: ($domain_count|tonumber),
      applied_to_hosts: ($applied=="true"),
      timestamp: (now|todate)
    }'
}

# Handler: update_agent
handle_update_agent() {
  local payload_json="$1"
  local job_agent_id="$2"
  
  log "INFO" "Executando update_agent..."
  
  # Buscar nova versao do servidor
  if ! secure_request "/functions/v1/serve-agent-update" "GET" "" 60 3; then
    echo '{"success": false, "error": "Failed to fetch agent update"}'
    return 1
  fi
  
  local response="$SECURE_RESP_BODY"
  local new_version new_script expected_sha256
  
  new_version="$(printf '%s\n' "$response" | jq -r '.version // empty')"
  new_script="$(printf '%s\n' "$response" | jq -r '.script_content // empty')"
  expected_sha256="$(printf '%s\n' "$response" | jq -r '.sha256 // empty')"
  
  if [[ -z "$new_version" ]] || [[ -z "$new_script" ]]; then
    log "INFO" "No update available or no script content"
    echo '{"success": true, "message": "No update available", "current_version": "'"$AGENT_VERSION"'"}'
    return 0
  fi
  
  # Verificar se ja estamos na versao mais recente
  if [[ "$new_version" == "$AGENT_VERSION" ]]; then
    log "INFO" "Already at latest version: $AGENT_VERSION"
    echo '{"success": true, "message": "Already at latest version", "version": "'"$AGENT_VERSION"'"}'
    return 0
  fi
  
  log "INFO" "Updating from $AGENT_VERSION to $new_version..."
  
  # Smart path detection para encontrar script atual
  local current_script_path=""
  
  # Estrategia 1: Usar $0 se valido
  if [[ -n "${BASH_SOURCE[0]:-}" ]] && [[ -f "${BASH_SOURCE[0]}" ]]; then
    current_script_path="${BASH_SOURCE[0]}"
    log "DEBUG" "Found script via BASH_SOURCE: $current_script_path"
  fi
  
  # Estrategia 2: Buscar por nome do agente
  if [[ -z "$current_script_path" ]]; then
    local agent_pattern="$INSTALL_DIR/cybershield-agent-${AGENT_NAME}.sh"
    if [[ -f "$agent_pattern" ]]; then
      current_script_path="$agent_pattern"
      log "DEBUG" "Found script via agent name: $current_script_path"
    fi
  fi
  
  # Estrategia 3: Glob search
  if [[ -z "$current_script_path" ]]; then
    for f in "$INSTALL_DIR"/cybershield-agent-*.sh; do
      if [[ -f "$f" ]]; then
        current_script_path="$f"
        log "DEBUG" "Found script via glob: $current_script_path"
        break
      fi
    done
  fi
  
  # Estrategia 4: Path padrao
  if [[ -z "$current_script_path" ]]; then
    current_script_path="$INSTALL_DIR/cybershield-agent-${AGENT_NAME}.sh"
    log "DEBUG" "Using default path: $current_script_path"
  fi
  
  # Backup do script atual (se existir)
  if [[ -f "$current_script_path" ]]; then
    cp "$current_script_path" "${current_script_path}.backup" 2>/dev/null || true
    log "INFO" "Backup created: ${current_script_path}.backup"
  fi
  
  # Validar SHA256 se fornecido
  if [[ -n "$expected_sha256" ]]; then
    local temp_script="/tmp/cybershield_update_$$.sh"
    printf '%s\n' "$new_script" > "$temp_script"
    local actual_sha256
    actual_sha256="$(shasum -a 256 "$temp_script" | awk '{print $1}')"
    
    if [[ "$actual_sha256" != "$expected_sha256" ]]; then
      log "ERROR" "SHA256 mismatch! Expected: $expected_sha256, Got: $actual_sha256"
      rm -f "$temp_script"
      echo '{"success": false, "error": "SHA256 validation failed"}'
      return 1
    fi
    
    log "SUCCESS" "SHA256 validated: $actual_sha256"
    rm -f "$temp_script"
  fi
  
  # Salvar novo script
  printf '%s\n' "$new_script" > "$current_script_path"
  chmod +x "$current_script_path"
  
  log "SUCCESS" "Updated agent to $new_version. New version will be active on next restart."
  
  jq -n \
    --arg old_version "$AGENT_VERSION" \
    --arg new_version "$new_version" \
    --arg path "$current_script_path" \
    '{
      success: true,
      old_version: $old_version,
      new_version: $new_version,
      script_path: $path,
      message: "Update successful. New version active on next restart."
    }'
}

# Handler: collect_web_activity (multi-user)
handle_collect_web_activity() {
  local payload_json="$1"
  local job_agent_id="$2"
  
  log "INFO" "Executando collect_web_activity (multi-user)..."
  
  local web_activity_items="[]"
  local total_domains=0
  
  # Iterar por todos os usuarios em /Users
  for user_home in /Users/*; do
    [[ -d "$user_home" ]] || continue
    local username
    username="$(basename "$user_home")"
    
    # Skip usuarios de sistema
    [[ "$username" == "Shared" ]] && continue
    [[ "$username" == ".localized" ]] && continue
    [[ "$username" =~ ^_ ]] && continue
    
    log "DEBUG" "Scanning browser history for user: $username"
    
    # Safari history
    local safari_history="$user_home/Library/Safari/History.db"
    if [[ -f "$safari_history" ]] && command -v sqlite3 >/dev/null 2>&1; then
      local safari_temp="/tmp/safari_history_${username}_$$.db"
      cp "$safari_history" "$safari_temp" 2>/dev/null || true
      
      if [[ -f "$safari_temp" ]]; then
        local safari_urls
        safari_urls="$(sqlite3 "$safari_temp" "SELECT DISTINCT url FROM history_items WHERE visit_count > 0 ORDER BY visit_time DESC LIMIT 100;" 2>/dev/null || echo "")"
        
        while IFS= read -r url; do
          if [[ -n "$url" ]]; then
            local domain
            domain="$(echo "$url" | awk -F/ '{print $3}' | sed 's/^www\.//')"
            if [[ -n "$domain" ]] && [[ ! "$domain" =~ ^(google|apple|icloud|microsoft) ]]; then
              web_activity_items="$(printf '%s\n' "$web_activity_items" | jq \
                --arg domain "$domain" \
                --arg source "safari_${username}" \
                --arg url "$url" \
                '. + [{"domain": $domain, "source": $source, "url_full": $url}]')"
              total_domains=$((total_domains + 1))
            fi
          fi
        done <<< "$safari_urls"
        
        rm -f "$safari_temp"
      fi
    fi
    
    # Chrome history
    local chrome_history="$user_home/Library/Application Support/Google/Chrome/Default/History"
    if [[ -f "$chrome_history" ]] && command -v sqlite3 >/dev/null 2>&1; then
      local chrome_temp="/tmp/chrome_history_${username}_$$.db"
      cp "$chrome_history" "$chrome_temp" 2>/dev/null || true
      
      if [[ -f "$chrome_temp" ]]; then
        local chrome_urls
        chrome_urls="$(sqlite3 "$chrome_temp" "SELECT DISTINCT url FROM urls WHERE last_visit_time > 0 ORDER BY last_visit_time DESC LIMIT 100;" 2>/dev/null || echo "")"
        
        while IFS= read -r url; do
          if [[ -n "$url" ]]; then
            local domain
            domain="$(echo "$url" | awk -F/ '{print $3}' | sed 's/^www\.//')"
            if [[ -n "$domain" ]] && [[ ! "$domain" =~ ^(google|googleapis|gstatic) ]]; then
              web_activity_items="$(printf '%s\n' "$web_activity_items" | jq \
                --arg domain "$domain" \
                --arg source "chrome_${username}" \
                --arg url "$url" \
                '. + [{"domain": $domain, "source": $source, "url_full": $url}]')"
              total_domains=$((total_domains + 1))
            fi
          fi
        done <<< "$chrome_urls"
        
        rm -f "$chrome_temp"
      fi
    fi
    
    # Firefox history
    local firefox_profile_dir="$user_home/Library/Application Support/Firefox/Profiles"
    if [[ -d "$firefox_profile_dir" ]]; then
      for profile in "$firefox_profile_dir"/*.default* "$firefox_profile_dir"/*.dev-edition-default*; do
        [[ -d "$profile" ]] || continue
        local ff_history="$profile/places.sqlite"
        
        if [[ -f "$ff_history" ]] && command -v sqlite3 >/dev/null 2>&1; then
          local ff_temp="/tmp/ff_history_${username}_$$.db"
          cp "$ff_history" "$ff_temp" 2>/dev/null || true
          
          if [[ -f "$ff_temp" ]]; then
            local ff_urls
            ff_urls="$(sqlite3 "$ff_temp" "SELECT DISTINCT url FROM moz_places WHERE visit_count > 0 ORDER BY last_visit_date DESC LIMIT 100;" 2>/dev/null || echo "")"
            
            while IFS= read -r url; do
              if [[ -n "$url" ]]; then
                local domain
                domain="$(echo "$url" | awk -F/ '{print $3}' | sed 's/^www\.//')"
                if [[ -n "$domain" ]] && [[ ! "$domain" =~ ^(mozilla|firefox) ]]; then
                  web_activity_items="$(printf '%s\n' "$web_activity_items" | jq \
                    --arg domain "$domain" \
                    --arg source "firefox_${username}" \
                    --arg url "$url" \
                    '. + [{"domain": $domain, "source": $source, "url_full": $url}]')"
                  total_domains=$((total_domains + 1))
                fi
              fi
            done <<< "$ff_urls"
            
            rm -f "$ff_temp"
          fi
        fi
      done
    fi
  done
  
  log "SUCCESS" "Collected $total_domains web activity entries"
  
  # Enviar para o servidor
  local body
  body="$(jq -n \
    --arg agent_id "$job_agent_id" \
    --argjson items "$web_activity_items" \
    '{agent_id: $agent_id, items: $items}'
  )"
  
  if secure_request "/functions/v1/submit-web-activity" "POST" "$body" 60 3; then
    log "SUCCESS" "Web activity submitted successfully"
  else
    log "WARN" "Failed to submit web activity"
  fi
  
  jq -n \
    --arg count "$total_domains" \
    '{
      success: true,
      domains_collected: ($count|tonumber),
      source: "browser_history_multiuser"
    }'
}

# Handler: software_inventory_collect
handle_software_inventory_collect() {
  local payload_json="$1"
  local job_agent_id="$2"
  
  log "INFO" "Executando software_inventory_collect..."
  
  local software_items="[]"
  local total_count=0
  
  # Listar aplicativos em /Applications
  for app in /Applications/*.app; do
    [[ -d "$app" ]] || continue
    local app_name version
    app_name="$(basename "$app" .app)"
    version="$(defaults read "$app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")"
    
    software_items="$(printf '%s\n' "$software_items" | jq \
      --arg name "$app_name" \
      --arg version "$version" \
      --arg source "applications" \
      '. + [{"name": $name, "version": $version, "source": $source}]')"
    total_count=$((total_count + 1))
  done
  
  # Homebrew packages
  if command -v brew >/dev/null 2>&1; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local pkg_name pkg_version
      pkg_name="$(echo "$line" | awk '{print $1}')"
      pkg_version="$(echo "$line" | awk '{print $2}')"
      
      software_items="$(printf '%s\n' "$software_items" | jq \
        --arg name "$pkg_name" \
        --arg version "$pkg_version" \
        --arg source "homebrew" \
        '. + [{"name": $name, "version": $version, "source": $source}]')"
      total_count=$((total_count + 1))
    done < <(brew list --versions 2>/dev/null)
  fi
  
  log "SUCCESS" "Collected $total_count software items"
  
  # Enviar para o servidor
  local body
  body="$(jq -n \
    --arg agent_id "$job_agent_id" \
    --argjson items "$software_items" \
    '{agent_id: $agent_id, items: $items}'
  )"
  
  if secure_request "/functions/v1/submit-software-inventory" "POST" "$body" 60 3; then
    log "SUCCESS" "Software inventory submitted successfully"
  else
    log "WARN" "Failed to submit software inventory"
  fi
  
  jq -n \
    --arg count "$total_count" \
    '{
      success: true,
      software_count: ($count|tonumber)
    }'
}

# Handler: collect_antivirus_status
handle_collect_antivirus_status() {
  local payload_json="$1"
  local job_agent_id="$2"
  
  log "INFO" "Executando collect_antivirus_status..."
  
  local av_items="[]"
  
  # XProtect version
  local xprotect_version="unknown"
  local xprotect_plist="/Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/version.plist"
  if [[ -f "$xprotect_plist" ]]; then
    xprotect_version="$(defaults read "$xprotect_plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")"
  fi
  
  av_items="$(printf '%s\n' "$av_items" | jq \
    --arg name "XProtect" \
    --arg version "$xprotect_version" \
    --arg status "active" \
    '. + [{"engine_name": $name, "engine_version": $version, "status": $status}]')"
  
  # MRT (Malware Removal Tool)
  local mrt_version="unknown"
  local mrt_plist="/Library/Apple/System/Library/CoreServices/MRT.app/Contents/Info.plist"
  if [[ -f "$mrt_plist" ]]; then
    mrt_version="$(defaults read "$mrt_plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")"
  fi
  
  av_items="$(printf '%s\n' "$av_items" | jq \
    --arg name "MRT" \
    --arg version "$mrt_version" \
    --arg status "active" \
    '. + [{"engine_name": $name, "engine_version": $version, "status": $status}]')"
  
  # Gatekeeper status
  local gatekeeper_status
  gatekeeper_status="$(spctl --status 2>/dev/null || echo "unknown")"
  local gatekeeper_enabled="disabled"
  [[ "$gatekeeper_status" == *"enabled"* ]] && gatekeeper_enabled="enabled"
  
  av_items="$(printf '%s\n' "$av_items" | jq \
    --arg name "Gatekeeper" \
    --arg version "N/A" \
    --arg status "$gatekeeper_enabled" \
    '. + [{"engine_name": $name, "engine_version": $version, "status": $status}]')"
  
  log "SUCCESS" "Collected antivirus status (XProtect, MRT, Gatekeeper)"
  
  # Enviar para o servidor
  local body
  body="$(jq -n \
    --arg agent_id "$job_agent_id" \
    --argjson items "$av_items" \
    '{agent_id: $agent_id, items: $items}'
  )"
  
  if secure_request "/functions/v1/submit-antivirus-status" "POST" "$body" 30 3; then
    log "SUCCESS" "Antivirus status submitted successfully"
  else
    log "WARN" "Failed to submit antivirus status"
  fi
  
  jq -n \
    --argjson items "$av_items" \
    '{
      success: true,
      engines_checked: ($items|length),
      items: $items
    }'
}

# Handler: fix_firewall
handle_fix_firewall() {
  local payload_json="$1"
  
  log "INFO" "Executando fix_firewall..."
  
  local firewall_tool="/usr/libexec/ApplicationFirewall/socketfilterfw"
  local changes_made="[]"
  
  # Verificar status atual
  local current_status
  current_status="$($firewall_tool --getglobalstate 2>/dev/null || echo "unknown")"
  
  # Ativar firewall se desativado
  if [[ "$current_status" != *"enabled"* ]]; then
    sudo "$firewall_tool" --setglobalstate on 2>/dev/null
    changes_made="$(printf '%s\n' "$changes_made" | jq '. + ["Enabled application firewall"]')"
    log "INFO" "Enabled application firewall"
  fi
  
  # Ativar stealth mode
  local stealth_status
  stealth_status="$($firewall_tool --getstealthmode 2>/dev/null || echo "unknown")"
  if [[ "$stealth_status" != *"enabled"* ]]; then
    sudo "$firewall_tool" --setstealthmode on 2>/dev/null
    changes_made="$(printf '%s\n' "$changes_made" | jq '. + ["Enabled stealth mode"]')"
    log "INFO" "Enabled stealth mode"
  fi
  
  log "SUCCESS" "Firewall configuration completed"
  
  jq -n \
    --argjson changes "$changes_made" \
    '{
      success: true,
      changes_made: $changes
    }'
}

# Handler: restart_service
handle_restart_service() {
  local payload_json="$1"
  
  log "INFO" "Executando restart_service..."
  
  local service_name
  service_name="$(printf '%s\n' "$payload_json" | jq -r '.service_name // empty')"
  
  if [[ -z "$service_name" ]]; then
    echo '{"success": false, "error": "service_name not provided"}'
    return 1
  fi
  
  log "INFO" "Restarting service: $service_name"
  
  # Tentar LaunchDaemon primeiro
  local plist_path="/Library/LaunchDaemons/${service_name}.plist"
  if [[ -f "$plist_path" ]]; then
    sudo launchctl unload "$plist_path" 2>/dev/null || true
    sleep 1
    sudo launchctl load "$plist_path" 2>/dev/null
    log "SUCCESS" "Restarted LaunchDaemon: $service_name"
    
    jq -n \
      --arg service "$service_name" \
      '{
        success: true,
        service: $service,
        type: "LaunchDaemon"
      }'
    return 0
  fi
  
  # Tentar LaunchAgent
  plist_path="/Library/LaunchAgents/${service_name}.plist"
  if [[ -f "$plist_path" ]]; then
    sudo launchctl unload "$plist_path" 2>/dev/null || true
    sleep 1
    sudo launchctl load "$plist_path" 2>/dev/null
    log "SUCCESS" "Restarted LaunchAgent: $service_name"
    
    jq -n \
      --arg service "$service_name" \
      '{
        success: true,
        service: $service,
        type: "LaunchAgent"
      }'
    return 0
  fi
  
  log "ERROR" "Service not found: $service_name"
  jq -n \
    --arg service "$service_name" \
    '{
      success: false,
      error: "Service not found",
      service: $service
    }'
}

# Handler: collect_network_info
handle_collect_network_info() {
  local payload_json="$1"
  local job_agent_id="$2"
  
  log "INFO" "Executando collect_network_info..."
  
  # Gateway IP
  local gateway_ip
  gateway_ip="$(netstat -rn | awk '/default/ {print $2; exit}')"
  
  # DNS servers
  local dns_servers
  dns_servers="$(scutil --dns 2>/dev/null | grep 'nameserver\[' | awk '{print $3}' | head -5 | jq -R -s -c 'split("\n") | map(select(length > 0))')"
  
  # Public IP
  local public_ip
  public_ip="$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "unknown")"
  
  # Network adapters
  local adapters="[]"
  while IFS= read -r interface; do
    [[ -z "$interface" ]] && continue
    local ip_addr mac_addr
    ip_addr="$(ifconfig "$interface" 2>/dev/null | awk '/inet / {print $2}')"
    mac_addr="$(ifconfig "$interface" 2>/dev/null | awk '/ether / {print $2}')"
    
    if [[ -n "$ip_addr" ]]; then
      adapters="$(printf '%s\n' "$adapters" | jq \
        --arg name "$interface" \
        --arg ip "$ip_addr" \
        --arg mac "${mac_addr:-unknown}" \
        '. + [{"name": $name, "ip_address": $ip, "mac_address": $mac}]')"
    fi
  done < <(networksetup -listallhardwareports 2>/dev/null | awk '/Device:/ {print $2}')
  
  # Firewall status
  local firewall_enabled="false"
  local fw_status
  fw_status="$(/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null || echo "")"
  [[ "$fw_status" == *"enabled"* ]] && firewall_enabled="true"
  
  # DNS connectivity test
  local dns_test="false"
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then
    dns_test="true"
  fi
  
  # HTTPS connectivity test
  local https_test="false"
  if curl -s --max-time 5 https://www.google.com >/dev/null 2>&1; then
    https_test="true"
  fi
  
  log "SUCCESS" "Network info collected"
  
  # Enviar para o servidor
  local body
  body="$(jq -n \
    --arg agent_id "$job_agent_id" \
    --arg gateway_ip "$gateway_ip" \
    --argjson dns_servers "$dns_servers" \
    --arg public_ip "$public_ip" \
    --argjson network_adapters "$adapters" \
    --arg firewall_enabled "$firewall_enabled" \
    --arg dns_test "$dns_test" \
    --arg https_test "$https_test" \
    '{
      agent_id: $agent_id,
      gateway_ip: $gateway_ip,
      dns_servers: $dns_servers,
      public_ip: $public_ip,
      network_adapters: $network_adapters,
      firewall_public: ($firewall_enabled=="true"),
      dns_test_success: ($dns_test=="true"),
      https_test_success: ($https_test=="true")
    }'
  )"
  
  if secure_request "/functions/v1/submit-network-info" "POST" "$body" 30 3; then
    log "SUCCESS" "Network info submitted successfully"
  else
    log "WARN" "Failed to submit network info"
  fi
  
  printf '%s\n' "$body" | jq '. + {success: true}'
}

# Handler: light_vuln_scan
handle_light_vuln_scan() {
  local payload_json="$1"
  local job_agent_id="$2"
  
  log "INFO" "Executando light_vuln_scan..."
  
  local findings="[]"
  
  # Check SSH configuration
  if [[ -f "/etc/ssh/sshd_config" ]]; then
    local ssh_config
    ssh_config="$(cat /etc/ssh/sshd_config 2>/dev/null)"
    
    # Root login check
    if echo "$ssh_config" | grep -q "^PermitRootLogin yes"; then
      findings="$(printf '%s\n' "$findings" | jq \
        '. + [{"severity": "high", "title": "SSH Root Login Enabled", "description": "PermitRootLogin is set to yes"}]')"
    fi
    
    # Password auth check
    if echo "$ssh_config" | grep -q "^PasswordAuthentication yes"; then
      findings="$(printf '%s\n' "$findings" | jq \
        '. + [{"severity": "medium", "title": "SSH Password Auth Enabled", "description": "Password authentication should be disabled in favor of key-based auth"}]')"
    fi
  fi
  
  # Check for world-writable files in important directories
  local world_writable
  world_writable="$(find /usr/local/bin /usr/bin 2>/dev/null -perm -0002 -type f | head -5)"
  if [[ -n "$world_writable" ]]; then
    findings="$(printf '%s\n' "$findings" | jq \
      --arg files "$world_writable" \
      '. + [{"severity": "high", "title": "World-Writable Executables", "description": ("Found world-writable files: " + $files)}]')"
  fi
  
  # Check SIP status
  local sip_status
  sip_status="$(csrutil status 2>/dev/null || echo "unknown")"
  if [[ "$sip_status" == *"disabled"* ]]; then
    findings="$(printf '%s\n' "$findings" | jq \
      '. + [{"severity": "critical", "title": "System Integrity Protection Disabled", "description": "SIP is disabled, leaving the system vulnerable"}]')"
  fi
  
  # Check Gatekeeper
  local gatekeeper
  gatekeeper="$(spctl --status 2>/dev/null || echo "unknown")"
  if [[ "$gatekeeper" == *"disabled"* ]]; then
    findings="$(printf '%s\n' "$findings" | jq \
      '. + [{"severity": "high", "title": "Gatekeeper Disabled", "description": "Gatekeeper is disabled, allowing unsigned apps"}]')"
  fi
  
  # Check FileVault
  local filevault
  filevault="$(fdesetup status 2>/dev/null || echo "unknown")"
  if [[ "$filevault" == *"Off"* ]]; then
    findings="$(printf '%s\n' "$findings" | jq \
      '. + [{"severity": "medium", "title": "FileVault Disabled", "description": "Disk encryption (FileVault) is not enabled"}]')"
  fi
  
  local finding_count
  finding_count="$(printf '%s\n' "$findings" | jq 'length')"
  log "SUCCESS" "Vulnerability scan completed: $finding_count findings"
  
  # Enviar para o servidor
  local body
  body="$(jq -n \
    --arg agent_id "$job_agent_id" \
    --argjson findings "$findings" \
    '{agent_id: $agent_id, findings: $findings}'
  )"
  
  if secure_request "/functions/v1/submit-vuln-findings" "POST" "$body" 30 3; then
    log "SUCCESS" "Vulnerability findings submitted successfully"
  else
    log "WARN" "Failed to submit vulnerability findings"
  fi
  
  jq -n \
    --argjson findings "$findings" \
    '{
      success: true,
      findings_count: ($findings|length),
      findings: $findings
    }'
}

########################################
# CHECK FOR UPDATES (24h interval)
########################################

check_for_updates() {
  log "INFO" "Checking for agent updates..."
  
  local body
  body="$(jq -n \
    --arg agent_version "$AGENT_VERSION" \
    --arg platform "macos" \
    '{agent_version: $agent_version, platform: $platform}'
  )"
  
  if ! secure_request "/functions/v1/check-agent-updates" "POST" "$body" 30 2; then
    log "WARN" "Failed to check for updates"
    return 1
  fi
  
  local response="$SECURE_RESP_BODY"
  local update_available new_version
  
  update_available="$(printf '%s\n' "$response" | jq -r '.update_available // false')"
  new_version="$(printf '%s\n' "$response" | jq -r '.version // empty')"
  
  if [[ "$update_available" == "true" ]] && [[ -n "$new_version" ]]; then
    log "INFO" "Update available: $new_version (current: $AGENT_VERSION)"
    # Auto-update sera tratado pelo servidor via job update_agent
    return 0
  fi
  
  log "INFO" "No updates available. Current version: $AGENT_VERSION"
  return 0
}

########################################
# EXECUCAO DE JOB
########################################

execute_job() {
  local job_id="$1"
  local job_type="$2"
  local payload_json="$3"
  local job_agent_id="${4:-}"

  log "INFO" "Executando job $job_id (type=$job_type)"
  
  local started_at
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local start_ts
  start_ts=$(date +%s)

  local output_json status error_msg
  status="completed"
  error_msg=""

  case "$job_type" in
    integration_test)
      local sys metrics
      sys="$(system_info_json)"
      metrics="$(system_metrics_json)"
      output_json="$(
        jq -n \
          --arg msg "Integration test OK" \
          --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
          --arg agent "$AGENT_NAME" \
          --argjson sys "$sys" \
          --argjson metrics "$metrics" \
          '{
            message: $msg,
            timestamp: $ts,
            agent: $agent,
            system: $sys,
            metrics: $metrics
          }'
      )"
      ;;
      
    collect_info)
      local sys metrics
      sys="$(system_info_json)"
      metrics="$(system_metrics_json)"
      output_json="$(
        jq -n \
          --argjson sys "$sys" \
          --argjson metrics "$metrics" \
          '{
            system: $sys,
            metrics: $metrics
          }'
      )"
      ;;
    
    report)
      local sys metrics cpu_percent mem_percent disk_percent hostname
      sys="$(system_info_json)"
      metrics="$(system_metrics_json)"
      
      cpu_percent="$(printf '%s\n' "$metrics" | jq -r '.cpu_load_percent')"
      mem_percent="$(printf '%s\n' "$metrics" | jq -r '.ram_used_percent')"
      disk_percent="$(printf '%s\n' "$metrics" | jq -r '.disk_used_percent')"
      hostname="$(printf '%s\n' "$sys" | jq -r '.hostname')"
      
      output_json="$(jq -n \
        --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg host "$hostname" \
        --arg cpu "$cpu_percent" \
        --arg mem "$mem_percent" \
        --arg disk "$disk_percent" \
        '{
          success: true,
          timestamp: $ts,
          hostname: $host,
          cpu_percent: ($cpu|tonumber),
          memory_percent: ($mem|tonumber),
          disk_percent: ($disk|tonumber)
        }'
      )"
      ;;
    
    sync_blocked_websites)
      output_json="$(handle_sync_blocked_websites "$payload_json")"
      ;;
    
    update_agent)
      output_json="$(handle_update_agent "$payload_json" "$job_agent_id")"
      ;;
    
    collect_web_activity)
      output_json="$(handle_collect_web_activity "$payload_json" "$job_agent_id")"
      ;;
    
    software_inventory_collect)
      output_json="$(handle_software_inventory_collect "$payload_json" "$job_agent_id")"
      ;;
    
    collect_antivirus_status)
      output_json="$(handle_collect_antivirus_status "$payload_json" "$job_agent_id")"
      ;;
    
    fix_firewall)
      output_json="$(handle_fix_firewall "$payload_json")"
      ;;
    
    restart_service)
      output_json="$(handle_restart_service "$payload_json")"
      ;;
    
    collect_network_info)
      output_json="$(handle_collect_network_info "$payload_json" "$job_agent_id")"
      ;;
    
    light_vuln_scan)
      output_json="$(handle_light_vuln_scan "$payload_json" "$job_agent_id")"
      ;;
    
    *)
      status="failed"
      error_msg="Tipo de job nao suportado: $job_type"
      output_json="$(jq -n --arg error "$error_msg" '{error: $error}')"
      ;;
  esac

  local end_ts exec_time
  end_ts=$(date +%s)
  exec_time=$(( end_ts - start_ts ))

  # Check if job failed
  local job_success
  job_success="$(printf '%s\n' "$output_json" | jq -r '.success // true')"
  if [[ "$job_success" == "false" ]]; then
    status="failed"
    error_msg="$(printf '%s\n' "$output_json" | jq -r '.error // "Unknown error"')"
  fi

  if [[ "$status" == "completed" ]]; then
    submit_job_result "$job_id" "completed" "$output_json" "" "$exec_time" "$started_at"
  else
    log "ERROR" "$error_msg"
    submit_job_result "$job_id" "failed" "$output_json" "$error_msg" "$exec_time" "$started_at"
  fi
}

########################################
# POLL JOBS
########################################

poll_jobs() {
  local body
  body="$(
    jq -n \
      --arg agent_name "$AGENT_NAME" \
      --arg agent_version "$AGENT_VERSION" \
      '{agent_name: $agent_name, agent_version: $agent_version}'
  )"

  log "INFO" "Consultando jobs..."
  if ! secure_request "/functions/v1/poll-jobs" "POST" "$body" 20 3; then
    log "ERROR" "poll-jobs falhou (status=$SECURE_RESP_STATUS)"
    return
  fi

  if [[ -z "$SECURE_RESP_BODY" ]]; then
    log "WARN" "Resposta de poll-jobs vazia"
    return
  fi

  local jobs_json="$SECURE_RESP_BODY"
  local count
  if ! count="$(printf '%s\n' "$jobs_json" | jq 'length' 2>/dev/null)"; then
    log "ERROR" "Erro ao parsear JSON de poll-jobs"
    return
  fi

  if [[ "$count" -eq 0 ]]; then
    log "INFO" "Nenhum job disponivel"
    return
  fi

  log "INFO" "Recebidos $count job(s) no poll-jobs"

  printf '%s\n' "$jobs_json" | jq -c '.[]' | while read -r job; do
    local job_id job_type payload_json job_agent_id
    job_id="$(printf '%s\n' "$job" | jq -r '.id')"
    job_type="$(printf '%s\n' "$job" | jq -r '.type')"
    payload_json="$(printf '%s\n' "$job" | jq -c '.payload // {}')"
    job_agent_id="$(printf '%s\n' "$job" | jq -r '.agent_id // empty')"
    execute_job "$job_id" "$job_type" "$payload_json" "$job_agent_id"
  done
}

########################################
# LOOP PRINCIPAL
########################################

main() {
  validate_hmac_secret

  local heartbeat_interval=30
  local poll_interval=30
  local metrics_interval=300  # 5 minutos
  local update_check_interval=86400  # 24 horas

  log "INFO" "============================================"
  log "INFO" "Iniciando CyberShield Agent - macOS $AGENT_VERSION"
  log "INFO" "ServerUrl = $SERVER_URL"
  log "INFO" "AgentName = $AGENT_NAME"

  local bootstrap_start bootstrap_elapsed
  bootstrap_start=$(date +%s)

  send_post_installation "true" "" "0"
  send_heartbeat

  bootstrap_elapsed=$(( $(date +%s) - bootstrap_start ))
  log "INFO" "Bootstrap concluido em ${bootstrap_elapsed}s"

  log "INFO" "Entrando no loop principal (heartbeat=${heartbeat_interval}s, poll=${poll_interval}s, metrics=${metrics_interval}s, update_check=${update_check_interval}s)"

  local last_hb last_poll last_metrics last_update_check now
  last_hb=$(date +%s)
  last_poll=$(date +%s)
  last_metrics=$(date +%s)
  last_update_check=$(date +%s)

  while true; do
    now=$(date +%s)

    if (( now - last_hb >= heartbeat_interval )); then
      send_heartbeat
      last_hb=$(date +%s)
    fi

    if (( now - last_poll >= poll_interval )); then
      poll_jobs
      last_poll=$(date +%s)
    fi

    # Enviar metricas a cada 5 minutos
    if (( now - last_metrics >= metrics_interval )); then
      log "INFO" "Coletando metricas de sistema (5min)..."
      local metrics_json sys_json cpu_p mem_p disk_p host uptime_s boot_time
      
      metrics_json="$(system_metrics_json)"
      sys_json="$(system_info_json)"
      
      cpu_p="$(printf '%s\n' "$metrics_json" | jq -r '.cpu_load_percent')"
      mem_p="$(printf '%s\n' "$metrics_json" | jq -r '.ram_used_percent')"
      disk_p="$(printf '%s\n' "$metrics_json" | jq -r '.disk_used_percent')"
      uptime_s="$(printf '%s\n' "$metrics_json" | jq -r '.uptime_seconds')"
      boot_time="$(printf '%s\n' "$metrics_json" | jq -r '.last_boot_time')"
      host="$(printf '%s\n' "$sys_json" | jq -r '.hostname')"
      
      if send_system_metrics "$cpu_p" "$mem_p" "$disk_p" "$host" "$uptime_s" "$boot_time"; then
        log "SUCCESS" "Metricas enviadas: CPU=${cpu_p}%, RAM=${mem_p}%, Disco=${disk_p}%, Uptime=${uptime_s}s"
      else
        log "WARN" "Falha ao enviar metricas (nao critico)"
      fi
      
      last_metrics=$(date +%s)
    fi

    # Check for updates a cada 24 horas
    if (( now - last_update_check >= update_check_interval )); then
      check_for_updates
      last_update_check=$(date +%s)
    fi

    sleep 2
  done
}

main "$@"
