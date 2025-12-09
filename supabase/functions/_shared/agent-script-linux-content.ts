/* eslint-disable no-useless-escape */
/**
 * CyberShield Agent Linux Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-linux-v3.sh
 * Versao: v3.10.28-WEB-ACTIVITY-DEDUP-FIX
 */

export const AGENT_SCRIPT_LINUX_SH = `#!/usr/bin/env bash
# CyberShield Agent - Linux
<<<<<<< HEAD
# Version: v3.10.25-BLOCKED-WEBSITES (Sync blocked sites, Smart Update, Multi-user Web Activity)
=======
# Version: v3.10.28-WEB-ACTIVITY-DEDUP-FIX (Sync all platforms)
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15

set -euo pipefail

########################################
# PARAMETROS
########################################

# Prioridade: argumentos > env vars curtas > env vars prefixadas CYBERSHIELD_*
<<<<<<< HEAD
SERVER_URL="\${SERVER_URL:-\${CYBERSHIELD_SERVER_URL:-}}"
AGENT_TOKEN="\${AGENT_TOKEN:-\${CYBERSHIELD_AGENT_TOKEN:-}}"
HMAC_SECRET="\${HMAC_SECRET:-\${CYBERSHIELD_HMAC_SECRET:-}}"
AGENT_NAME="\${AGENT_NAME:-\${CYBERSHIELD_AGENT_NAME:-\$(hostname -s)}}"
AGENT_VERSION="\${AGENT_VERSION:-\${CYBERSHIELD_AGENT_VERSION:-v3.10.25}}"
=======
SERVER_URL="\\\${SERVER_URL:-\\\${CYBERSHIELD_SERVER_URL:-}}"
AGENT_TOKEN="\\\${AGENT_TOKEN:-\\\${CYBERSHIELD_AGENT_TOKEN:-}}"
HMAC_SECRET="\\\${HMAC_SECRET:-\\\${CYBERSHIELD_HMAC_SECRET:-}}"
AGENT_NAME="\\\${AGENT_NAME:-\\\${CYBERSHIELD_AGENT_NAME:-\\\$(hostname -s)}}"
AGENT_VERSION="\\\${AGENT_VERSION:-\\\${CYBERSHIELD_AGENT_VERSION:-v3.10.28}}"
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15

# Parse argumentos (sobrescreve env vars)
while [[ \\\$# -gt 0 ]]; do
  case "\\\$1" in
    --server-url)
      SERVER_URL="\\\$2"; shift 2;;
    --agent-token)
      AGENT_TOKEN="\\\$2"; shift 2;;
    --hmac-secret)
      HMAC_SECRET="\\\$2"; shift 2;;
    --agent-name)
      AGENT_NAME="\\\$2"; shift 2;;
    --agent-version)
      AGENT_VERSION="\\\$2"; shift 2;;
    *)
      echo "Parametro desconhecido: \\\$1" >&2
      echo "Uso: \\\$0 --server-url URL --agent-token TOKEN --hmac-secret SECRET [--agent-name NAME] [--agent-version VERSION]"
      exit 1;;
  esac
done

# Validacao com mensagens claras
if [[ -z "\\\$SERVER_URL" ]]; then
  echo "SERVER_URL nao definido" >&2
  exit 1
fi

if [[ -z "\\\$AGENT_TOKEN" ]]; then
  echo "AGENT_TOKEN nao definido" >&2
  exit 1
fi

if [[ -z "\\\$HMAC_SECRET" ]]; then
  echo "HMAC_SECRET nao definido" >&2
  exit 1
fi

SERVER_URL="\\\${SERVER_URL%/}"

# Install directory
INSTALL_DIR="/opt/cybershield"
mkdir -p "\\\$INSTALL_DIR" 2>/dev/null || true

# Install directory
INSTALL_DIR="/opt/cybershield"
mkdir -p "\$INSTALL_DIR" 2>/dev/null || true

########################################
# LOG
########################################

LOG_DIR="/var/log/cybershield"
LOG_FILE="\\\$LOG_DIR/agent.log"

mkdir -p "\\\$LOG_DIR" || true
touch "\\\$LOG_FILE" 2>/dev/null || true

log() {
  local level="\\\$1"; shift
  local ts
  ts="\\\$(date '+%Y-%m-%d %H:%M:%S')"
  local line="[\\\$ts] [\\\$level] \\\$*"
  echo "\\\$line"
  echo "\\\$line" >> "\\\$LOG_FILE" 2>/dev/null || true
}

########################################
# HMAC (HEX)
########################################

validate_hmac_secret() {
  if [[ ! "\\\$HMAC_SECRET" =~ ^[0-9a-fA-F]{64}\\\$ ]]; then
    log "ERROR" "HMAC_SECRET invalido"
    exit 1
  fi
}

hmac_sign() {
  local message="\\\$1"
  printf '%s' "\\\$message" \\\\
    | openssl dgst -sha256 -mac HMAC -macopt "hexkey:\\\$HMAC_SECRET" \\\\
    | awk '{print \\\$2}'
}

########################################
# REQUISICAO SEGURA
########################################

SECURE_RESP_STATUS=""
SECURE_RESP_BODY=""

secure_request() {
  local path="\\\$1"
  local method="\\\$2"
  local body="\\\${3:-}"
  local timeout_sec="\\\${4:-30}"
  local max_retries="\\\${5:-3}"

  local url="\\\${SERVER_URL}\\\${path}"
  local retry_count=0
  local retry_delay=2

  while true; do
    local timestamp nonce payload signature http_code raw
    timestamp=\\\$(( \\\$(date +%s) * 1000 ))
    if command -v uuidgen >/dev/null 2>&1; then
      nonce="\\\$(uuidgen)"
    else
      nonce="\\\$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "nonce-\\\$(date +%s)")"
    fi

    payload="\\\${timestamp}:\\\${nonce}:\\\${body}"
    signature="\\\$(hmac_sign "\\\$payload")"

    log "DEBUG" "Request \\\$method \\\$url"

    raw="\\\$(
      curl -sS \\\\
        -X "\\\$method" \\\\
        -H "X-Agent-Token: \\\$AGENT_TOKEN" \\\\
        -H "X-HMAC-Signature: \\\$signature" \\\\
        -H "X-Timestamp: \\\$timestamp" \\\\
        -H "X-Nonce: \\\$nonce" \\\\
        -H "Content-Type: application/json" \\\\
        --max-time "\\\$timeout_sec" \\\\
        -w '\\\\n%{http_code}' \\\\
        \\\${body:+ -d "\\\$body"} \\\\
        "\\\$url"
    )" || true

    http_code="\\\$(printf '%s\\\\n' "\\\$raw" | tail -n1)"
    SECURE_RESP_BODY="\\\$(printf '%s\\\\n' "\\\$raw" | sed '\\\$d')"
    SECURE_RESP_STATUS="\\\$http_code"

    log "DEBUG" "Response \\\$http_code"

    if [[ "\\\$http_code" == "401" ]]; then
      log "ERROR" "Erro de autenticacao (401)"
      return 1
    fi

    if [[ "\\\$http_code" -ge 200 && "\\\$http_code" -lt 300 ]]; then
      return 0
    fi

    retry_count=\\\$((retry_count+1))
    if (( retry_count >= max_retries )); then
      log "ERROR" "Falha definitiva apos \\\$max_retries tentativas"
      return 1
    fi

    sleep "\\\$retry_delay"
    retry_delay=\\\$((retry_delay * 2))
  done
}

########################################
# SYSTEM INFO / METRICS
########################################

system_info_json() {
  local os_name os_version hostname total_ram_gb
  os_name="\\\$(. /etc/os-release 2>/dev/null; echo "\\\${PRETTY_NAME:-Linux}")"
  os_version="\\\$(uname -r)"
  hostname="\\\$(hostname -s)"
  total_ram_gb="\\\$(free -m 2>/dev/null | awk '/Mem:/ {printf "%.2f", \\\$2/1024}')"

  jq -n \\\\
    --arg os_type "Linux" \\\\
    --arg os_name "\\\$os_name" \\\\
    --arg os_version "\\\$os_version" \\\\
    --arg hostname "\\\$hostname" \\\\
    --arg total_ram_gb "\\\$total_ram_gb" \\\\
    --arg agent_name "\\\$AGENT_NAME" \\\\
    --arg agent_version "\\\$AGENT_VERSION" \\\\
    '{os_type: \\\$os_type, os_name: \\\$os_name, os_version: \\\$os_version, hostname: \\\$hostname, total_ram_gb: (\\\$total_ram_gb|tonumber), agent_name: \\\$agent_name, agent_version: \\\$agent_version}'
}

system_metrics_json() {
  local cpu_load ram_used disk_used
  cpu_load="\\\$(awk -F' ' '/cpu /{u=\\\$2; n=\\\$3; s=\\\$4; i=\\\$5; w=\\\$6; irq=\\\$7; soft=\\\$8; steal=\\\$9; idle=i+w; busy=u+n+s+irq+soft+steal; print busy/(busy+idle)*100}' /proc/stat 2>/dev/null | head -n1)"
  cpu_load="\\\${cpu_load:-0}"

  if free -m >/dev/null 2>&1; then
    ram_used="\\\$(free -m | awk '/Mem:/ {printf "%.2f", (\\\$3/\\\$2)*100}')"
  else
    ram_used="0"
  fi

<<<<<<< HEAD
  # DISK
  disk_used="\$(df / | awk 'NR==2 {print \$5}' | sed 's/%//')"
  disk_used="\${disk_used:-0}"
=======
  disk_used="\\\$(df / | awk 'NR==2 {print \\\$5}' | sed 's/%//')"
  disk_used="\\\${disk_used:-0}"
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15

  jq -n \\\\
    --arg cpu_load "\\\$cpu_load" \\\\
    --arg ram_used "\\\$ram_used" \\\\
    --arg disk_used "\\\$disk_used" \\\\
    '{cpu_load_percent: (\\\$cpu_load|tonumber), ram_used_percent: (\\\$ram_used|tonumber), disk_used_percent: (\\\$disk_used|tonumber)}'
}

########################################
# SEND SYSTEM METRICS
########################################

send_system_metrics() {
  local cpu_usage_percent="\\\$1"
  local memory_usage_percent="\\\$2"
  local disk_usage_percent="\\\$3"
  local hostname="\\\$4"
  
  local body
  body="\\\$(jq -n \\\\
    --arg cpu "\\\$cpu_usage_percent" \\\\
    --arg mem "\\\$memory_usage_percent" \\\\
    --arg disk "\\\$disk_usage_percent" \\\\
    --arg host "\\\$hostname" \\\\
    '{cpu_usage_percent: (\\\$cpu|tonumber), memory_usage_percent: (\\\$mem|tonumber), disk_usage_percent: (\\\$disk|tonumber), hostname: \\\$host}'
  )"
  
  log "INFO" "Enviando metricas de sistema..."
  if secure_request "/functions/v1/submit-system-metrics" "POST" "\\\$body" 15 3; then
    log "SUCCESS" "Metricas enviadas"
    return 0
  else
    log "WARN" "Falha ao enviar metricas"
    return 1
  fi
}

########################################
# POST INSTALLATION
########################################

send_post_installation() {
  local success="\\\${1:-true}"
  local error_message="\\\${2:-""}"
  local install_time="\\\${3:-0}"

  local sys_json metrics_json body
  sys_json="\\\$(system_info_json)"
  metrics_json="\\\$(system_metrics_json)"

  body="\\\$(jq -n \\\\
    --arg agent_name "\\\$AGENT_NAME" \\\\
    --arg event_type "\\\$( [[ "\\\$success" == "true" ]] && echo "post_installation" || echo "post_installation_unverified" )" \\\\
    --arg platform "linux" \\\\
    --arg agent_version "\\\$AGENT_VERSION" \\\\
    --argjson metadata "\\\$(jq -n --argjson sys "\\\$sys_json" --argjson metrics "\\\$metrics_json" '{os_name: \\\$sys.os_name, os_version: \\\$sys.os_version, hostname: \\\$sys.hostname}')" \\\\
    '{agent_name: \\\$agent_name, event_type: \\\$event_type, platform: \\\$platform, agent_version: \\\$agent_version, success: true, metadata: \\\$metadata}'
  )"

  log "INFO" "Enviando post_installation..."
  secure_request "/functions/v1/track-installation-event" "POST" "\\\$body" 20 2 || true
}

########################################
# HEARTBEAT
########################################

send_heartbeat() {
  local sys_json metrics_json body
  sys_json="\\\$(system_info_json)"
  metrics_json="\\\$(system_metrics_json)"

  body="\\\$(jq -n \\\\
    --arg agent_name "\\\$AGENT_NAME" \\\\
    --arg platform "linux" \\\\
    --arg agent_version "\\\$AGENT_VERSION" \\\\
    --argjson sys "\\\$sys_json" \\\\
    --argjson metrics "\\\$metrics_json" \\\\
    '{agent_name: \\\$agent_name, platform: \\\$platform, os_name: \\\$sys.os_name, os_version: \\\$sys.os_version, hostname: \\\$sys.hostname, agent_version: \\\$agent_version, metrics: \\\$metrics}'
  )"

  log "INFO" "Enviando heartbeat..."
  if secure_request "/functions/v1/heartbeat" "POST" "\\\$body" 15 3; then
    log "SUCCESS" "Heartbeat OK"
  else
    log "ERROR" "Heartbeat falhou"
  fi
}

########################################
# SUBMIT JOB RESULT
########################################

submit_job_result() {
<<<<<<< HEAD
  local job_id="\$1"
  local status="\$2"     # completed | failed
  local output_json="\$3"
  local error_message="\${4:-""}"
  local exec_time="\${5:-0}"
  local started_at="\${6:-\$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
=======
  local job_id="\\\$1"
  local status="\\\$2"
  local output_json="\\\$3"
  local error_message="\\\${4:-""}"
  local exec_time="\\\${5:-0}"
  local started_at="\\\${6:-\\\$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15

  local body
  body="\\\$(jq -n \\\\
    --arg job_id "\\\$job_id" \\\\
    --arg status "\\\$status" \\\\
    --arg error_message "\\\$error_message" \\\\
    --arg exec_time "\\\$exec_time" \\\\
    --arg started_at "\\\$started_at" \\\\
    --argjson output "\\\$output_json" \\\\
    '{job_id: \\\$job_id, status: \\\$status, output: \\\$output, error_message: \\\$error_message, execution_time_seconds: (\\\$exec_time|tonumber), started_at: \\\$started_at}'
  )"

  log "INFO" "Enviando resultado do job \\\$job_id..."
  secure_request "/functions/v1/submit-job-result" "POST" "\\\$body" 30 3
}

########################################
# EXECUCAO DE JOB
########################################

execute_job() {
  local job_id="\\\$1"
  local job_type="\\\$2"
  local payload_json="\\\$3"

  log "INFO" "Executando job \\\$job_id (type=\\\$job_type)"
  
<<<<<<< HEAD
  local started_at
  started_at="\$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local start_ts
  start_ts=\$(date +%s)
=======
  local started_at="\\\$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local start_ts=\\\$(date +%s)
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15

  local output_json status error_msg
  status="completed"
  error_msg=""

  case "\\\$job_type" in
    integration_test|collect_info|report)
      local sys metrics
      sys="\\\$(system_info_json)"
      metrics="\\\$(system_metrics_json)"
      output_json="\\\$(jq -n --argjson sys "\\\$sys" --argjson metrics "\\\$metrics" '{system: \\\$sys, metrics: \\\$metrics}')"
      ;;

    sync_blocked_websites)
      log "INFO" "[BLOCKED-SITES] Sincronizando..."
      if secure_request "/functions/v1/get-blocked-websites" "GET" "" 30 3; then
        local blocked_domains="\\\$(echo "\\\$SECURE_RESP_BODY" | jq -r '.domains // []')"
        local count=\\\$(echo "\\\$blocked_domains" | jq 'length')
        echo "\\\$blocked_domains" > "\\\$INSTALL_DIR/blocked_websites.json"
        output_json="\\\$(jq -n --argjson c "\\\$count" '{success: true, domains_count: \\\$c}')"
      else
        status="failed"
        error_msg="Falha ao buscar sites bloqueados"
        output_json='{"error": "fetch_failed"}'
      fi
      ;;

<<<<<<< HEAD
    report)
      local sys metrics cpu_percent mem_percent disk_percent hostname
      sys="\$(system_info_json)"
      metrics="\$(system_metrics_json)"
=======
    update_agent)
      log "INFO" "[UPDATE] Iniciando auto-atualizacao..."
      if secure_request "/functions/v1/serve-agent-update" "GET" "" 60 3; then
        local new_version=\\\$(echo "\\\$SECURE_RESP_BODY" | jq -r '.version')
        local script_text=\\\$(echo "\\\$SECURE_RESP_BODY" | jq -r '.script_content')
        local expected_hash=\\\$(echo "\\\$SECURE_RESP_BODY" | jq -r '.sha256')
        
        local target_script="\\\$INSTALL_DIR/cybershield-agent-\\\$AGENT_NAME.sh"
        local temp_script="/tmp/cybershield-agent-update.sh"
        echo "\\\$script_text" > "\\\$temp_script"
        
        local actual_hash=\\\$(sha256sum "\\\$temp_script" | awk '{print \\\$1}')
        if [[ "\\\$actual_hash" != "\\\$expected_hash" ]]; then
          rm -f "\\\$temp_script"
          status="failed"
          error_msg="SHA256 mismatch"
          output_json='{"error": "sha256_mismatch"}'
        else
          mv "\\\$temp_script" "\\\$target_script"
          chmod +x "\\\$target_script"
          output_json="\\\$(jq -n --arg v "\\\$new_version" '{success: true, newVersion: \\\$v}')"
          log "SUCCESS" "[UPDATE] Atualizado para \\\$new_version"
        fi
      else
        status="failed"
        error_msg="Falha ao buscar atualizacao"
        output_json='{"error": "fetch_failed"}'
      fi
      ;;

    collect_web_activity)
      log "INFO" "[WEB-ACTIVITY] Coletando..."
      local items="[]"
      local now_utc=\\\$(date -u +"%Y-%m-%dT%H:%M:%SZ")
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15
      
      for user_home in /home/*; do
        [[ -d "\\\$user_home" ]] || continue
        local user_name=\\\$(basename "\\\$user_home")
        
        local chrome_history="\\\$user_home/.config/google-chrome/Default/History"
        if [[ -f "\\\$chrome_history" ]] && command -v sqlite3 >/dev/null 2>&1; then
          local temp_db="/tmp/chrome_\\\$\\\$_\\\$(date +%s).db"
          cp "\\\$chrome_history" "\\\$temp_db" 2>/dev/null || continue
          local urls=\\\$(sqlite3 "\\\$temp_db" "SELECT DISTINCT url FROM urls LIMIT 50;" 2>/dev/null || echo "")
          rm -f "\\\$temp_db"
          while IFS= read -r url; do
            [[ -n "\\\$url" ]] || continue
            local domain=\\\$(echo "\\\$url" | awk -F/ '{print \\\$3}' | sed 's/^www\\\\.//')
            [[ -n "\\\$domain" ]] && items=\\\$(echo "\\\$items" | jq --arg d "\\\$domain" --arg s "chrome_\\\$user_name" '. + [{domain: \\\$d, source: \\\$s}]')
          done <<< "\\\$urls"
        fi
      done
      
      local count=\\\$(echo "\\\$items" | jq 'length')
      local body=\\\$(jq -n --argjson items "\\\$items" '{items: \\\$items}')
      secure_request "/functions/v1/submit-web-activity" "POST" "\\\$body" 30 3 || true
      output_json="\\\$(jq -n --argjson c "\\\$count" '{success: true, domains_count: \\\$c}')"
      ;;

    software_inventory_collect)
      log "INFO" "[SOFTWARE] Coletando inventario..."
      local software_list="[]"
      
      if command -v dpkg >/dev/null 2>&1; then
        while IFS= read -r line; do
          local name=\\\$(echo "\\\$line" | awk '{print \\\$2}')
          local version=\\\$(echo "\\\$line" | awk '{print \\\$3}')
          [[ -n "\\\$name" ]] && software_list=\\\$(echo "\\\$software_list" | jq --arg n "\\\$name" --arg v "\\\$version" '. + [{name: \\\$n, version: \\\$v}]')
        done < <(dpkg -l 2>/dev/null | grep '^ii' | head -200)
      fi
      
      local count=\\\$(echo "\\\$software_list" | jq 'length')
      local body=\\\$(jq -n --argjson items "\\\$software_list" '{items: \\\$items}')
      secure_request "/functions/v1/submit-software-inventory" "POST" "\\\$body" 30 3 || true
      output_json="\\\$(jq -n --argjson c "\\\$count" '{success: true, software_count: \\\$c}')"
      ;;

    collect_antivirus_status)
      log "INFO" "[ANTIVIRUS] Verificando..."
      local av_name="none" av_status="not_installed" av_version=""
      
      if command -v clamscan >/dev/null 2>&1; then
        av_name="ClamAV"
        av_version=\\\$(clamscan --version 2>/dev/null | head -1 | awk '{print \\\$2}')
        av_status="installed"
      fi
      
      output_json="\\\$(jq -n --arg name "\\\$av_name" --arg status "\\\$av_status" --arg version "\\\$av_version" '{antivirus: \\\$name, status: \\\$status, version: \\\$version}')"
      ;;

    fix_firewall)
      log "INFO" "[FIREWALL] Habilitando..."
      local result=""
      if command -v ufw >/dev/null 2>&1; then
        ufw --force enable 2>/dev/null && result="ufw enabled"
      elif command -v firewall-cmd >/dev/null 2>&1; then
        systemctl start firewalld 2>/dev/null && result="firewalld started"
      fi
      output_json="\\\$(jq -n --arg r "\\\$result" '{success: true, result: \\\$r}')"
      ;;

    restart_service)
      log "INFO" "[SERVICE] Reiniciando..."
      local service_name=\\\$(echo "\\\$payload_json" | jq -r '.serviceName // ""')
      if [[ -n "\\\$service_name" ]] && systemctl restart "\\\$service_name" 2>/dev/null; then
        output_json="\\\$(jq -n --arg svc "\\\$service_name" '{success: true, service: \\\$svc}')"
      else
        status="failed"
        error_msg="Falha ao reiniciar servico"
        output_json='{"error": "restart_failed"}'
      fi
      ;;

    collect_network_info)
      log "INFO" "[NETWORK] Coletando..."
      local gateway=\\\$(ip route | grep default | awk '{print \\\$3}' | head -1)
      local public_ip=\\\$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "unknown")
      output_json="\\\$(jq -n --arg gw "\\\$gateway" --arg ip "\\\$public_ip" '{gateway: \\\$gw, public_ip: \\\$ip}')"
      ;;

    light_vuln_scan)
      log "INFO" "[VULN] Executando scan..."
      local findings="[]"
      if [[ -f "/etc/ssh/sshd_config" ]] && grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config 2>/dev/null; then
        findings=\\\$(echo "\\\$findings" | jq '. + [{severity: "high", finding: "Root login via SSH permitido"}]')
      fi
      local count=\\\$(echo "\\\$findings" | jq 'length')
      output_json="\\\$(jq -n --argjson findings "\\\$findings" --argjson c "\\\$count" '{success: true, findings: \\\$findings, finding_count: \\\$c}')"
      ;;

    sync_blocked_websites)
      log "INFO" "[BLOCKED-SITES] Sincronizando lista de sites bloqueados..."
      
      # Buscar lista do servidor
      if ! secure_request "/functions/v1/get-blocked-websites" "GET" "" 30 3; then
        status="failed"
        error_msg="Falha ao buscar lista de sites bloqueados"
        output_json='{"error": "'"\$error_msg"'"}'
      else
        local blocked_domains
        blocked_domains="\$(echo "\$SECURE_RESP_BODY" | jq -r '.domains // []')"
        local count
        count=\$(echo "\$blocked_domains" | jq 'length')
        
        # Salvar lista local
        local blocked_list_path="\$INSTALL_DIR/blocked_websites.json"
        local blocked_data
        blocked_data=\$(jq -n \\
          --arg updated_at "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
          --argjson domains "\$blocked_domains" \\
          '{updated_at: \$updated_at, domains: \$domains}')
        
        echo "\$blocked_data" > "\$blocked_list_path"
        
        # Aplicar ao /etc/hosts se solicitado
        local apply_to_hosts
        apply_to_hosts=\$(echo "\$payload_json" | jq -r '.apply_to_hosts // false')
        local hosts_modified=0
        
        if [[ "\$apply_to_hosts" == "true" ]] && (( count > 0 )); then
          local hosts_file="/etc/hosts"
          local start_marker="# BEGIN CYBERSHIELD BLOCKED"
          local end_marker="# END CYBERSHIELD BLOCKED"
          
          # Remover bloqueios antigos
          sed -i "/\$start_marker/,/\$end_marker/d" "\$hosts_file" 2>/dev/null || true
          
          # Adicionar novos
          {
            echo "\$start_marker"
            echo "\$blocked_domains" | jq -r '.[]' | while read -r domain; do
              clean_domain=\$(echo "\$domain" | sed 's/^\\*\\.//' | sed 's/\\*//g')
              if [[ -n "\$clean_domain" ]]; then
                echo "127.0.0.1 \$clean_domain"
                echo "127.0.0.1 www.\$clean_domain"
                hosts_modified=\$((hosts_modified + 1))
              fi
            done
            echo "\$end_marker"
          } >> "\$hosts_file"
          
          # Flush DNS cache se disponível
          systemctl restart systemd-resolved 2>/dev/null || \\
          service nscd restart 2>/dev/null || \\
          service dnsmasq restart 2>/dev/null || true
        fi
        
        output_json=\$(jq -n \\
          --arg msg "Sites bloqueados sincronizados" \\
          --argjson count "\$count" \\
          --argjson hosts_mod "\$hosts_modified" \\
          --arg path "\$blocked_list_path" \\
          --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
          '{message: \$msg, domains_count: \$count, hosts_modified: \$hosts_mod, list_path: \$path, synced_at: \$ts}')
      fi
      ;;

    update_agent)
      log "INFO" "[UPDATE] Iniciando auto-atualizacao..."
      
      # Buscar nova versao do servidor
      if ! secure_request "/functions/v1/serve-agent-update" "GET" "" 60 3; then
        status="failed"
        error_msg="Falha ao buscar script de atualizacao"
        output_json='{"error": "'"\$error_msg"'"}'
      else
        local new_version script_text expected_hash
        new_version=\$(echo "\$SECURE_RESP_BODY" | jq -r '.version')
        script_text=\$(echo "\$SECURE_RESP_BODY" | jq -r '.script_content')
        expected_hash=\$(echo "\$SECURE_RESP_BODY" | jq -r '.sha256')
        
        log "INFO" "[UPDATE] Nova versao disponivel: \$new_version"
        
        # Detectar script atual (smart path detection)
        local target_script="\$INSTALL_DIR/cybershield-agent-\$AGENT_NAME.sh"
        local current_script=""
        
        for path in "\$0" "\$INSTALL_DIR/cybershield-agent-\$AGENT_NAME.sh" "\$INSTALL_DIR/cybershield-agent-v3.sh" "\$INSTALL_DIR/cybershield-agent.sh"; do
          if [[ -f "\$path" ]]; then
            current_script="\$path"
            log "INFO" "[UPDATE] Script atual detectado: \$current_script"
            break
          fi
        done
        
        # Fallback: glob search
        if [[ -z "\$current_script" ]]; then
          current_script=\$(find "\$INSTALL_DIR" -name "cybershield-agent-*.sh" -type f 2>/dev/null | head -1)
          [[ -n "\$current_script" ]] && log "INFO" "[UPDATE] Script via glob: \$current_script"
        fi
        
        # Salvar novo script
        local temp_script="/tmp/cybershield-agent-update-\$new_version.sh"
        echo "\$script_text" > "\$temp_script"
        
        # Validar SHA256
        local actual_hash
        actual_hash=\$(sha256sum "\$temp_script" | awk '{print \$1}')
        
        if [[ "\$actual_hash" != "\$expected_hash" ]]; then
          rm -f "\$temp_script"
          status="failed"
          error_msg="SHA256 mismatch! Esperado: \$expected_hash, Obtido: \$actual_hash"
          output_json='{"error": "'"\$error_msg"'"}'
        else
          log "SUCCESS" "[UPDATE] SHA256 validado: \$actual_hash"
          
          # Backup (opcional)
          if [[ -n "\$current_script" && -f "\$current_script" ]]; then
            cp "\$current_script" "\${current_script}.backup.\$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
          fi
          
          # Instalar novo script
          mv "\$temp_script" "\$target_script"
          chmod +x "\$target_script"
          
          log "SUCCESS" "[UPDATE] Script instalado: \$target_script"
          
          # Atualizar systemd service se existir
          if [[ -f "/etc/systemd/system/cybershield-agent.service" ]]; then
            sed -i "s|ExecStart=.*|ExecStart=/bin/bash \$target_script|g" /etc/systemd/system/cybershield-agent.service
            systemctl daemon-reload
            log "INFO" "[UPDATE] Systemd service atualizado. Reinicie para aplicar."
          fi
          
          output_json=\$(jq -n \\
            --arg msg "Agent updated successfully" \\
            --arg ver "\$new_version" \\
            --arg path "\$target_script" \\
            --arg hash "\$actual_hash" \\
            --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
            '{message: \$msg, newVersion: \$ver, targetPath: \$path, sha256: \$hash, updatedAt: \$ts}')
          
          log "INFO" "[UPDATE] Nova versao carregada no proximo boot/restart do service"
        fi
      fi
      ;;

    collect_web_activity)
      log "INFO" "[WEB-ACTIVITY] Iniciando coleta multi-usuario..."
      local items="[]"
      local now_utc
      now_utc=\$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      
      # 1. DNS Cache (systemd-resolve)
      if command -v resolvectl >/dev/null 2>&1; then
        local dns_domains
        dns_domains=\$(resolvectl statistics 2>/dev/null | grep -oE '[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}' | sort -u | head -50)
        for domain in \$dns_domains; do
          items=\$(echo "\$items" | jq --arg d "\$domain" --arg s "dns_cache" --arg t "\$now_utc" '. + [{domain: \$d, source: \$s, visited_at: \$t}]')
        done
      fi
      
      # 2. Iterar por todos os usuarios em /home/*
      for user_home in /home/*; do
        [[ -d "\$user_home" ]] || continue
        local user_name
        user_name=\$(basename "\$user_home")
        log "INFO" "[WEB-ACTIVITY] Processando usuario: \$user_name"
        
        # Chrome
        local chrome_history="\$user_home/.config/google-chrome/Default/History"
        if [[ -f "\$chrome_history" ]] && command -v sqlite3 >/dev/null 2>&1; then
          local temp_db="/tmp/chrome_history_\$\$_\$(date +%s).db"
          cp "\$chrome_history" "\$temp_db" 2>/dev/null || continue
          
          local chrome_urls
          chrome_urls=\$(sqlite3 "\$temp_db" "SELECT DISTINCT url FROM urls ORDER BY last_visit_time DESC LIMIT 50;" 2>/dev/null || echo "")
          rm -f "\$temp_db"
          
          while IFS= read -r url; do
            [[ -n "\$url" ]] || continue
            local domain
            domain=\$(echo "\$url" | awk -F/ '{print \$3}' | sed 's/^www\\.//')
            [[ -n "\$domain" ]] && items=\$(echo "\$items" | jq --arg d "\$domain" --arg s "chrome_\$user_name" --arg t "\$now_utc" '. + [{domain: \$d, source: \$s, visited_at: \$t}]')
          done <<< "\$chrome_urls"
        fi
        
        # Firefox
        for ff_profile in "\$user_home"/.mozilla/firefox/*.default*; do
          [[ -d "\$ff_profile" ]] || continue
          local ff_history="\$ff_profile/places.sqlite"
          [[ -f "\$ff_history" ]] || continue
          
          local temp_db="/tmp/firefox_history_\$\$_\$(date +%s).db"
          cp "\$ff_history" "\$temp_db" 2>/dev/null || continue
          
          local ff_urls
          ff_urls=\$(sqlite3 "\$temp_db" "SELECT DISTINCT url FROM moz_places WHERE visit_count > 0 ORDER BY last_visit_date DESC LIMIT 50;" 2>/dev/null || echo "")
          rm -f "\$temp_db"
          
          while IFS= read -r url; do
            [[ -n "\$url" ]] || continue
            local domain
            domain=\$(echo "\$url" | awk -F/ '{print \$3}' | sed 's/^www\\.//')
            [[ -n "\$domain" ]] && items=\$(echo "\$items" | jq --arg d "\$domain" --arg s "firefox_\$user_name" --arg t "\$now_utc" '. + [{domain: \$d, source: \$s, visited_at: \$t}]')
          done <<< "\$ff_urls"
          break
        done
      done
      
      # Deduplicate
      local unique_items
      unique_items=\$(echo "\$items" | jq 'unique_by(.domain) | .[0:200]')
      local count
      count=\$(echo "\$unique_items" | jq 'length')
      
      if (( count == 0 )); then
        output_json='{"success": true, "message": "Nenhum dominio encontrado", "domains_count": 0}'
      else
        # Enviar para backend
        local body
        body=\$(jq -n --argjson items "\$unique_items" '{items: \$items}')
        if secure_request "/functions/v1/submit-web-activity" "POST" "\$body" 30 3; then
          output_json=\$(jq -n --argjson c "\$count" '{success: true, message: "Atividade web coletada", domains_count: \$c}')
        else
          status="failed"
          error_msg="Falha ao enviar atividade web"
          output_json='{"error": "'"\$error_msg"'"}'
        fi
      fi
      ;;

    software_inventory_collect)
      log "INFO" "[SOFTWARE] Coletando inventario de software..."
      local software_list="[]"
      
      # dpkg (Debian/Ubuntu)
      if command -v dpkg >/dev/null 2>&1; then
        while IFS= read -r line; do
          local name version
          name=\$(echo "\$line" | awk '{print \$2}')
          version=\$(echo "\$line" | awk '{print \$3}')
          [[ -n "\$name" ]] && software_list=\$(echo "\$software_list" | jq --arg n "\$name" --arg v "\$version" --arg s "dpkg" '. + [{name: \$n, version: \$v, source: \$s}]')
        done < <(dpkg -l 2>/dev/null | grep '^ii' | head -200)
      fi
      
      # rpm (RHEL/CentOS/Fedora)
      if command -v rpm >/dev/null 2>&1; then
        while IFS= read -r line; do
          local name version
          name=\$(echo "\$line" | cut -d' ' -f1)
          version=\$(echo "\$line" | cut -d' ' -f2)
          [[ -n "\$name" ]] && software_list=\$(echo "\$software_list" | jq --arg n "\$name" --arg v "\$version" --arg s "rpm" '. + [{name: \$n, version: \$v, source: \$s}]')
        done < <(rpm -qa --qf '%{NAME} %{VERSION}-%{RELEASE}\\n' 2>/dev/null | head -200)
      fi
      
      # snap
      if command -v snap >/dev/null 2>&1; then
        while IFS= read -r line; do
          local name version
          name=\$(echo "\$line" | awk '{print \$1}')
          version=\$(echo "\$line" | awk '{print \$2}')
          [[ -n "\$name" && "\$name" != "Name" ]] && software_list=\$(echo "\$software_list" | jq --arg n "\$name" --arg v "\$version" --arg s "snap" '. + [{name: \$n, version: \$v, source: \$s}]')
        done < <(snap list 2>/dev/null | tail -n +2 | head -50)
      fi
      
      # flatpak
      if command -v flatpak >/dev/null 2>&1; then
        while IFS= read -r line; do
          local name version
          name=\$(echo "\$line" | awk '{print \$1}')
          version=\$(echo "\$line" | awk '{print \$3}')
          [[ -n "\$name" && "\$name" != "Name" ]] && software_list=\$(echo "\$software_list" | jq --arg n "\$name" --arg v "\$version" --arg s "flatpak" '. + [{name: \$n, version: \$v, source: \$s}]')
        done < <(flatpak list --columns=name,version 2>/dev/null | tail -n +1 | head -50)
      fi
      
      local count
      count=\$(echo "\$software_list" | jq 'length')
      
      # Enviar para backend
      local body
      body=\$(jq -n --argjson items "\$software_list" '{items: \$items}')
      if secure_request "/functions/v1/submit-software-inventory" "POST" "\$body" 30 3; then
        output_json=\$(jq -n --argjson c "\$count" '{success: true, message: "Inventario coletado", software_count: \$c}')
      else
        status="failed"
        error_msg="Falha ao enviar inventario"
        output_json='{"error": "'"\$error_msg"'"}'
      fi
      ;;

    collect_antivirus_status)
      log "INFO" "[ANTIVIRUS] Verificando status do antivirus..."
      local av_name="none"
      local av_status="not_installed"
      local av_version=""
      
      # ClamAV
      if command -v clamscan >/dev/null 2>&1; then
        av_name="ClamAV"
        av_version=\$(clamscan --version 2>/dev/null | head -1 | awk '{print \$2}')
        if systemctl is-active clamav-freshclam >/dev/null 2>&1 || systemctl is-active clamd >/dev/null 2>&1; then
          av_status="active"
        else
          av_status="installed_inactive"
        fi
      fi
      
      # Sophos
      if [[ -f "/opt/sophos-av/bin/savdctl" ]]; then
        av_name="Sophos"
        av_status=\$(/opt/sophos-av/bin/savdctl status 2>/dev/null | grep -q "running" && echo "active" || echo "inactive")
        av_version=\$(/opt/sophos-av/bin/savdctl --version 2>/dev/null | head -1)
      fi
      
      output_json=\$(jq -n \\
        --arg name "\$av_name" \\
        --arg status "\$av_status" \\
        --arg version "\$av_version" \\
        --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
        '{antivirus: \$name, status: \$status, version: \$version, collected_at: \$ts}')
      ;;

    fix_firewall)
      log "INFO" "[FIREWALL] Habilitando firewall..."
      local firewall_result=""
      
      # ufw (Ubuntu/Debian)
      if command -v ufw >/dev/null 2>&1; then
        ufw --force enable 2>/dev/null && firewall_result="ufw enabled"
      # firewalld (RHEL/CentOS)
      elif command -v firewall-cmd >/dev/null 2>&1; then
        systemctl start firewalld 2>/dev/null
        systemctl enable firewalld 2>/dev/null
        firewall_result="firewalld enabled"
      # iptables fallback
      elif command -v iptables >/dev/null 2>&1; then
        firewall_result="iptables available (manual config required)"
      else
        firewall_result="no firewall found"
      fi
      
      output_json=\$(jq -n \\
        --arg result "\$firewall_result" \\
        --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
        '{success: true, result: \$result, executed_at: \$ts}')
      ;;

    restart_service)
      log "INFO" "[SERVICE] Reiniciando servico..."
      local service_name
      service_name=\$(echo "\$payload_json" | jq -r '.serviceName // ""')
      
      if [[ -z "\$service_name" ]]; then
        status="failed"
        error_msg="Nome do servico nao especificado"
        output_json='{"error": "'"\$error_msg"'"}'
      elif systemctl restart "\$service_name" 2>/dev/null; then
        output_json=\$(jq -n \\
          --arg svc "\$service_name" \\
          --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
          '{success: true, service: \$svc, action: "restarted", executed_at: \$ts}')
      else
        status="failed"
        error_msg="Falha ao reiniciar servico \$service_name"
        output_json='{"error": "'"\$error_msg"'"}'
      fi
      ;;

    collect_network_info)
      log "INFO" "[NETWORK] Coletando informacoes de rede..."
      local network_info="{}"
      
      # IP addresses
      local ip_info
      ip_info=\$(ip addr show 2>/dev/null | jq -R -s 'split("\\n") | map(select(length > 0))' || echo "[]")
      
      # Gateway
      local gateway
      gateway=\$(ip route | grep default | awk '{print \$3}' | head -1)
      
      # DNS
      local dns_servers
      dns_servers=\$(cat /etc/resolv.conf 2>/dev/null | grep nameserver | awk '{print \$2}' | jq -R -s 'split("\\n") | map(select(length > 0))')
      
      # Public IP
      local public_ip
      public_ip=\$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo "unknown")
      
      # Firewall status
      local fw_status="unknown"
      if command -v ufw >/dev/null 2>&1; then
        fw_status=\$(ufw status 2>/dev/null | head -1)
      elif command -v firewall-cmd >/dev/null 2>&1; then
        fw_status=\$(firewall-cmd --state 2>/dev/null || echo "unknown")
      fi
      
      output_json=\$(jq -n \\
        --arg gateway "\$gateway" \\
        --argjson dns "\$dns_servers" \\
        --arg public_ip "\$public_ip" \\
        --arg firewall "\$fw_status" \\
        --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
        '{gateway: \$gateway, dns_servers: \$dns, public_ip: \$public_ip, firewall_status: \$firewall, collected_at: \$ts}')
      ;;

    light_vuln_scan)
      log "INFO" "[VULN] Executando scan de vulnerabilidades..."
      local findings="[]"
      
      # Check SSH config
      if [[ -f "/etc/ssh/sshd_config" ]]; then
        if grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config 2>/dev/null; then
          findings=\$(echo "\$findings" | jq '. + [{severity: "high", category: "ssh", finding: "Root login via SSH permitido"}]')
        fi
        if grep -q "^PasswordAuthentication yes" /etc/ssh/sshd_config 2>/dev/null; then
          findings=\$(echo "\$findings" | jq '. + [{severity: "medium", category: "ssh", finding: "Autenticacao por senha SSH habilitada"}]')
        fi
      fi
      
      # Check for common vulnerabilities
      # Writable /etc/passwd
      if [[ -w "/etc/passwd" ]]; then
        findings=\$(echo "\$findings" | jq '. + [{severity: "critical", category: "permissions", finding: "/etc/passwd e gravavel"}]')
      fi
      
      # World-writable files in /etc
      local ww_files
      ww_files=\$(find /etc -perm -002 -type f 2>/dev/null | head -5 | tr '\\n' ' ')
      if [[ -n "\$ww_files" ]]; then
        findings=\$(echo "\$findings" | jq --arg f "\$ww_files" '. + [{severity: "high", category: "permissions", finding: ("Arquivos world-writable em /etc: " + \$f)}]')
      fi
      
      # SUID binaries
      local suid_count
      suid_count=\$(find / -perm -4000 -type f 2>/dev/null | wc -l)
      if (( suid_count > 100 )); then
        findings=\$(echo "\$findings" | jq --argjson c "\$suid_count" '. + [{severity: "medium", category: "suid", finding: ("Alto numero de binarios SUID: " + (\$c|tostring))}]')
      fi
      
      local finding_count
      finding_count=\$(echo "\$findings" | jq 'length')
      
      output_json=\$(jq -n \\
        --argjson findings "\$findings" \\
        --argjson count "\$finding_count" \\
        --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
        '{success: true, findings: \$findings, finding_count: \$count, scanned_at: \$ts}')
      ;;

    *)
      status="failed"
      error_msg="Tipo de job nao suportado: \\\$job_type"
      output_json="\\\$(jq -n --arg error "\\\$error_msg" '{error: \\\$error}')"
      ;;
  esac

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
  if ! secure_request "/functions/v1/poll-jobs" "POST" "\\\$body" 20 3; then
    log "ERROR" "poll-jobs falhou"
    return
  fi

  if [[ -z "\\\$SECURE_RESP_BODY" ]]; then
    return
  fi

  local jobs_json="\\\$SECURE_RESP_BODY"
  local count
  count="\\\$(printf '%s\\\\n' "\\\$jobs_json" | jq 'length' 2>/dev/null)" || return

  if [[ "\\\$count" -eq 0 ]]; then
    log "INFO" "Nenhum job disponivel"
    return
  fi

  log "INFO" "Recebidos \\\$count job(s)"

  printf '%s\\\\n' "\\\$jobs_json" | jq -c '.[]' | while read -r job; do
    local job_id="\\\$(printf '%s\\\\n' "\\\$job" | jq -r '.id')"
    local job_type="\\\$(printf '%s\\\\n' "\\\$job" | jq -r '.type')"
    local payload_json="\\\$(printf '%s\\\\n' "\\\$job" | jq -c '.payload // {}')"
    execute_job "\\\$job_id" "\\\$job_type" "\\\$payload_json"
  done
}

########################################
# AUTO-UPDATE CHECK (every 24h)
########################################

check_for_updates() {
  log "INFO" "[AUTO-UPDATE] Verificando atualizacoes..."
<<<<<<< HEAD
  
  if ! secure_request "/functions/v1/check-agent-updates" "POST" "{\\"agent_version\\":\\"\$AGENT_VERSION\\",\\"platform\\":\\"linux\\"}" 30 3; then
    log "WARN" "[AUTO-UPDATE] Falha ao verificar atualizacoes"
    return
  fi
  
  local update_available
  update_available=\$(echo "\$SECURE_RESP_BODY" | jq -r '.update_available // false')
  
  if [[ "\$update_available" == "true" ]]; then
    local new_version
    new_version=\$(echo "\$SECURE_RESP_BODY" | jq -r '.latest_version')
    log "INFO" "[AUTO-UPDATE] Nova versao disponivel: \$new_version (atual: \$AGENT_VERSION)"
  else
    log "INFO" "[AUTO-UPDATE] Agente esta atualizado"
=======
  secure_request "/functions/v1/check-agent-updates" "POST" "{\\"agent_version\\":\\"\\\$AGENT_VERSION\\",\\"platform\\":\\"linux\\"}" 30 3 || return
  local update_available=\\\$(echo "\\\$SECURE_RESP_BODY" | jq -r '.update_available // false')
  if [[ "\\\$update_available" == "true" ]]; then
    log "INFO" "[AUTO-UPDATE] Nova versao disponivel"
  else
    log "INFO" "[AUTO-UPDATE] Agente atualizado"
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15
  fi
}

########################################
# LOOP PRINCIPAL
########################################

main() {
  validate_hmac_secret

  local heartbeat_interval=30
  local poll_interval=30
<<<<<<< HEAD
  local metrics_interval=300  # 5 minutos
  local update_check_interval=86400  # 24 horas

  log "INFO" "============================================"
  log "INFO" "Iniciando CyberShield Agent - Linux \$AGENT_VERSION"
  log "INFO" "ServerUrl = \$SERVER_URL"
  log "INFO" "AgentName = \$AGENT_NAME"
  log "INFO" "InstallDir = \$INSTALL_DIR"
=======
  local metrics_interval=300
  local update_check_interval=86400

  log "INFO" "============================================"
  log "INFO" "Iniciando CyberShield Agent - Linux \\\$AGENT_VERSION"
  log "INFO" "ServerUrl = \\\$SERVER_URL"
  log "INFO" "AgentName = \\\$AGENT_NAME"
  log "INFO" "InstallDir = \\\$INSTALL_DIR"
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15

  send_post_installation "true" "" "0"
  send_heartbeat

  log "INFO" "Entrando no loop principal"

<<<<<<< HEAD
  log "INFO" "Entrando no loop principal (heartbeat=\${heartbeat_interval}s, poll=\${poll_interval}s, metrics=\${metrics_interval}s)"

  local last_hb last_poll last_metrics last_update_check now
  last_hb=\$(date +%s)
  last_poll=\$(date +%s)
  last_metrics=\$(date +%s)
  last_update_check=\$(date +%s)
=======
  local last_hb=\\\$(date +%s) last_poll=\\\$(date +%s) last_metrics=\\\$(date +%s) last_update_check=\\\$(date +%s) now
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15

  while true; do
    now=\\\$(date +%s)

    if (( now - last_hb >= heartbeat_interval )); then
      send_heartbeat
      last_hb=\\\$(date +%s)
    fi

    if (( now - last_poll >= poll_interval )); then
      poll_jobs
      last_poll=\\\$(date +%s)
    fi

<<<<<<< HEAD
    # Enviar metricas a cada 5 minutos
=======
>>>>>>> 9c951e5705b3ee8fa9f36c8396d6994b80705e15
    if (( now - last_metrics >= metrics_interval )); then
      log "INFO" "Coletando metricas..."
      local metrics_json="\\\$(system_metrics_json)"
      local sys_json="\\\$(system_info_json)"
      local cpu_p="\\\$(printf '%s\\\\n' "\\\$metrics_json" | jq -r '.cpu_load_percent')"
      local mem_p="\\\$(printf '%s\\\\n' "\\\$metrics_json" | jq -r '.ram_used_percent')"
      local disk_p="\\\$(printf '%s\\\\n' "\\\$metrics_json" | jq -r '.disk_used_percent')"
      local host="\\\$(printf '%s\\\\n' "\\\$sys_json" | jq -r '.hostname')"
      send_system_metrics "\\\$cpu_p" "\\\$mem_p" "\\\$disk_p" "\\\$host" || true
      last_metrics=\\\$(date +%s)
    fi

    if (( now - last_update_check >= update_check_interval )); then
      check_for_updates
      last_update_check=\\\$(date +%s)
    fi

    # Verificar atualizacoes a cada 24h
    if (( now - last_update_check >= update_check_interval )); then
      check_for_updates
      last_update_check=\$(date +%s)
    fi

    sleep 2
  done
}

main "\\\$@"
`;

export function getAgentScriptLinux(): string {
  return AGENT_SCRIPT_LINUX_SH;
}
