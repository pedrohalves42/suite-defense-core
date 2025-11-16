/**
 * CyberShield Agent Linux Script - Inline Content
 * Version: 3.0.0 - HMAC HEX Fix + Jobs v2
 * Keep in sync with: public/agent-scripts/cybershield-agent-linux-v3.sh
 */

export const AGENT_SCRIPT_LINUX_SH = `#!/usr/bin/env bash
# CyberShield Agent - Linux
# Version: v3.0.0 (HMAC HEX, Jobs + Reports, Post-Installation)

set -euo pipefail

# Prioridade: argumentos > env vars curtas > env vars prefixadas CYBERSHIELD_*
SERVER_URL="\${SERVER_URL:-\${CYBERSHIELD_SERVER_URL:-}}"
AGENT_TOKEN="\${AGENT_TOKEN:-\${CYBERSHIELD_AGENT_TOKEN:-}}"
HMAC_SECRET="\${HMAC_SECRET:-\${CYBERSHIELD_HMAC_SECRET:-}}"
AGENT_NAME="\${AGENT_NAME:-\${CYBERSHIELD_AGENT_NAME:-\$(hostname -s)}}"
AGENT_VERSION="\${AGENT_VERSION:-\${CYBERSHIELD_AGENT_VERSION:-3.0.0}}"

while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --server-url) SERVER_URL="\$2"; shift 2;;
    --agent-token) AGENT_TOKEN="\$2"; shift 2;;
    --hmac-secret) HMAC_SECRET="\$2"; shift 2;;
    --agent-name) AGENT_NAME="\$2"; shift 2;;
    --agent-version) AGENT_VERSION="\$2"; shift 2;;
    *) echo "❌ Parâmetro desconhecido: \$1" >&2; exit 1;;
  esac
done

if [[ -z "\$SERVER_URL" ]]; then
  echo "❌ SERVER_URL não definido" >&2
  echo "Use: --server-url URL ou SERVER_URL=... ou CYBERSHIELD_SERVER_URL=..." >&2
  exit 1
fi

if [[ -z "\$AGENT_TOKEN" ]]; then
  echo "❌ AGENT_TOKEN não definido" >&2
  echo "Use: --agent-token TOKEN ou AGENT_TOKEN=... ou CYBERSHIELD_AGENT_TOKEN=..." >&2
  exit 1
fi

if [[ -z "\$HMAC_SECRET" ]]; then
  echo "❌ HMAC_SECRET não definido" >&2
  echo "Use: --hmac-secret SECRET ou HMAC_SECRET=... ou CYBERSHIELD_HMAC_SECRET=..." >&2
  exit 1
fi

SERVER_URL="\${SERVER_URL%/}"

LOG_DIR="/var/log/cybershield"
LOG_FILE="\$LOG_DIR/agent.log"
mkdir -p "\$LOG_DIR" || true
touch "\$LOG_FILE" 2>/dev/null || true

log() {
  local level="\$1"; shift
  local ts="\$(date '+%Y-%m-%d %H:%M:%S')"
  local line="[\$ts] [\$level] \$*"
  echo "\$line"
  echo "\$line" >> "\$LOG_FILE" 2>/dev/null || true
}

validate_hmac_secret() {
  if [[ ! "\$HMAC_SECRET" =~ ^[0-9a-fA-F]{64}\$ ]]; then
    log "ERROR" "HMAC_SECRET inválido. Esperado 64 hex chars, length=\${#HMAC_SECRET}"
    exit 1
  fi
}

hmac_sign() {
  local message="\$1"
  printf '%s' "\$message" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:\$HMAC_SECRET" | awk '{print \$2}'
}

SECURE_RESP_STATUS=""
SECURE_RESP_BODY=""

secure_request() {
  local path="\$1" method="\$2" body="\${3:-}" timeout_sec="\${4:-30}" max_retries="\${5:-3}"
  local url="\${SERVER_URL}\${path}" retry_count=0 retry_delay=2

  while true; do
    local timestamp nonce payload signature http_code raw
    timestamp=\$(( \$(date +%s) * 1000 ))
    nonce="\$(command -v uuidgen >/dev/null 2>&1 && uuidgen || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "nonce-\$(date +%s)")"
    payload="\${timestamp}:\${nonce}:\${body}"
    signature="\$(hmac_sign "\$payload")"

    log "DEBUG" "Request \$method \$url (body_length=\${#body})"

    raw="\$(curl -sS -X "\$method" -H "X-Agent-Token: \$AGENT_TOKEN" -H "X-HMAC-Signature: \$signature" \\
      -H "X-Timestamp: \$timestamp" -H "X-Nonce: \$nonce" -H "Content-Type: application/json" \\
      --max-time "\$timeout_sec" -w '\\n%{http_code}' \${body:+ -d "\$body"} "\$url")" || true

    http_code="\$(printf '%s\\n' "\$raw" | tail -n1)"
    SECURE_RESP_BODY="\$(printf '%s\\n' "\$raw" | sed '\$d')"
    SECURE_RESP_STATUS="\$http_code"

    log "DEBUG" "Response \$http_code from \$url"

    [[ "\$http_code" == "401" ]] && { log "ERROR" "Erro 401. Verifique token/hmac/clock."; return 1; }
    [[ "\$http_code" -ge 200 && "\$http_code" -lt 300 ]] && return 0

    retry_count=\$((retry_count+1))
    (( retry_count >= max_retries )) && { log "ERROR" "Falha após \$max_retries tentativas"; return 1; }

    log "WARN" "Retry \$retry_count, aguardando \${retry_delay}s..."
    sleep "\$retry_delay"
    retry_delay=\$((retry_delay * 2))
  done
}

system_info_json() {
  local os_name os_version hostname total_ram_gb
  os_name="\$(. /etc/os-release 2>/dev/null; echo "\${PRETTY_NAME:-Linux}")"
  os_version="\$(uname -r)"
  hostname="\$(hostname -s)"
  total_ram_gb="\$(free -m 2>/dev/null | awk '/Mem:/ {printf "%.2f", \$2/1024}')"

  jq -n --arg os_type "Linux" --arg os_name "\$os_name" --arg os_version "\$os_version" \\
    --arg hostname "\$hostname" --arg total_ram_gb "\$total_ram_gb" --arg agent_name "\$AGENT_NAME" \\
    --arg agent_version "\$AGENT_VERSION" '{os_type:\$os_type,os_name:\$os_name,os_version:\$os_version,hostname:\$hostname,total_ram_gb:(\$total_ram_gb|tonumber),agent_name:\$agent_name,agent_version:\$agent_version}'
}

system_metrics_json() {
  local cpu_load ram_used
  cpu_load="\$(awk -F' ' '/cpu /{u=\$2;n=\$3;s=\$4;i=\$5;w=\$6;irq=\$7;soft=\$8;steal=\$9;idle=i+w;busy=u+n+s+irq+soft+steal;print busy/(busy+idle)*100}' /proc/stat 2>/dev/null | head -n1)"
  cpu_load="\${cpu_load:-0}"
  ram_used="\$(free -m 2>/dev/null | awk '/Mem:/ {printf "%.2f", (\$3/\$2)*100}' || echo 0)"

  jq -n --arg cpu_load "\$cpu_load" --arg ram_used "\$ram_used" '{cpu_load_percent:(\$cpu_load|tonumber),ram_used_percent:(\$ram_used|tonumber)}'
}

send_post_installation() {
  local success="\${1:-true}" error_message="\${2:-}" install_time="\${3:-0}"
  local sys_json metrics_json body
  sys_json="\$(system_info_json)"
  metrics_json="\$(system_metrics_json)"

  body="\$(jq -n --arg agent_name "\$AGENT_NAME" \\
    --arg event_type "\$([[ "\$success" == "true" ]] && echo "post_installation" || echo "post_installation_unverified")" \\
    --arg platform "linux" --arg installation_method "one_click" --arg success_b "\$success" \\
    --arg error_message "\$error_message" --arg agent_version "\$AGENT_VERSION" \\
    --argjson metadata "\$(jq -n --argjson sys "\$sys_json" --argjson metrics "\$metrics_json" '{os_name:\$sys.os_name,os_version:\$sys.os_version,hostname:\$sys.hostname,total_ram_gb:\$sys.total_ram_gb,cpu_load:\$metrics.cpu_load_percent,ram_used:\$metrics.ram_used_percent}')" \\
    --arg install_time "\$install_time" '{agent_name:\$agent_name,event_type:\$event_type,platform:\$platform,installation_method:\$installation_method,success:(\$success_b=="true"),installation_time_seconds:(\$install_time|tonumber),error_message:\$error_message,agent_version:\$agent_version,network_connectivity:true,metadata:\$metadata}')"

  log "INFO" "Enviando post_installation..."
  secure_request "/functions/v1/track-installation-event" "POST" "\$body" 20 2 && log "SUCCESS" "post_installation OK" || log "WARN" "Falha post_installation"
}

send_heartbeat() {
  local sys_json metrics_json body
  sys_json="\$(system_info_json)"
  metrics_json="\$(system_metrics_json)"

  body="\$(jq -n --arg agent_name "\$AGENT_NAME" --arg platform "linux" --arg agent_version "\$AGENT_VERSION" \\
    --argjson sys "\$sys_json" --argjson metrics "\$metrics_json" \\
    '{agent_name:\$agent_name,platform:\$platform,os_name:\$sys.os_name,os_version:\$sys.os_version,hostname:\$sys.hostname,agent_version:\$agent_version,metrics:\$metrics}')"

  log "INFO" "Enviando heartbeat..."
  secure_request "/functions/v1/heartbeat" "POST" "\$body" 15 3 && log "SUCCESS" "Heartbeat OK" || log "ERROR" "Heartbeat falhou"
}

submit_job_result() {
  local job_id="\$1" status="\$2" output_json="\$3" error_message="\${4:-}" exec_time="\${5:-0}"
  local body="\$(jq -n --arg job_id "\$job_id" --arg status "\$status" --arg error_message "\$error_message" \\
    --arg exec_time "\$exec_time" --argjson output "\$output_json" \\
    '{job_id:\$job_id,status:\$status,output:\$output,error_message:\$error_message,execution_time_seconds:(\$exec_time|tonumber)}')"

  log "INFO" "Enviando resultado job \$job_id (status=\$status)..."
  secure_request "/functions/v1/submit-job-result" "POST" "\$body" 30 3 && { log "SUCCESS" "Resultado enviado"; return 0; } || { log "ERROR" "Falha envio resultado"; return 1; }
}

execute_job() {
  local job_id="\$1" job_type="\$2" payload_json="\$3"
  log "INFO" "Executando job \$job_id (type=\$job_type)"
  local start_ts=\$(date +%s) output_json status="completed" error_msg=""

  case "\$job_type" in
    integration_test)
      local sys metrics
      sys="\$(system_info_json)"
      metrics="\$(system_metrics_json)"
      output_json="\$(jq -n --arg msg "Integration test OK" --arg ts "\$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \\
        --arg agent "\$AGENT_NAME" --argjson sys "\$sys" --argjson metrics "\$metrics" \\
        '{message:\$msg,timestamp:\$ts,agent:\$agent,system:\$sys,metrics:\$metrics}')"
      ;;
    collect_info)
      local sys metrics
      sys="\$(system_info_json)"
      metrics="\$(system_metrics_json)"
      output_json="\$(jq -n --argjson sys "\$sys" --argjson metrics "\$metrics" '{system:\$sys,metrics:\$metrics}')"
      ;;
    *)
      status="failed"
      error_msg="Tipo job não suportado: \$job_type"
      output_json="\$(jq -n --arg error "\$error_msg" '{error:\$error}')"
      ;;
  esac

  local end_ts=\$(date +%s) exec_time=\$(( end_ts - start_ts ))
  [[ "\$status" == "completed" ]] && submit_job_result "\$job_id" "completed" "\$output_json" "" "\$exec_time" || { log "ERROR" "\$error_msg"; submit_job_result "\$job_id" "failed" "\$output_json" "\$error_msg" "\$exec_time"; }
}

poll_jobs() {
  local body="\$(jq -n --arg agent_name "\$AGENT_NAME" --arg agent_version "\$AGENT_VERSION" '{agent_name:\$agent_name,agent_version:\$agent_version}')"
  log "INFO" "Consultando jobs..."
  secure_request "/functions/v1/poll-jobs" "POST" "\$body" 20 3 || { log "ERROR" "poll-jobs falhou"; return; }

  [[ -z "\$SECURE_RESP_BODY" ]] && { log "WARN" "Resposta vazia"; return; }

  local jobs_json="\$SECURE_RESP_BODY" count
  count="\$(printf '%s\\n' "\$jobs_json" | jq 'length' 2>/dev/null)" || { log "ERROR" "Erro parsear JSON"; return; }
  [[ "\$count" -eq 0 ]] && { log "INFO" "Nenhum job"; return; }

  log "INFO" "Recebidos \$count job(s)"
  printf '%s\\n' "\$jobs_json" | jq -c '.[]' | while read -r job; do
    local job_id job_type payload_json
    job_id="\$(printf '%s\\n' "\$job" | jq -r '.id')"
    job_type="\$(printf '%s\\n' "\$job" | jq -r '.type')"
    payload_json="\$(printf '%s\\n' "\$job" | jq -c '.payload // {}')"
    execute_job "\$job_id" "\$job_type" "\$payload_json"
  done
}

main() {
  validate_hmac_secret
  local heartbeat_interval=30 poll_interval=30

  log "INFO" "============================================"
  log "INFO" "Iniciando CyberShield Agent - Linux v\$AGENT_VERSION"
  log "INFO" "ServerUrl = \$SERVER_URL"
  log "INFO" "AgentName = \$AGENT_NAME"

  local bootstrap_start=\$(date +%s)
  send_post_installation "true" "" "0"
  send_heartbeat

  local bootstrap_elapsed=\$(( \$(date +%s) - bootstrap_start ))
  log "INFO" "Bootstrap em \${bootstrap_elapsed}s"
  log "INFO" "Loop principal (heartbeat=\${heartbeat_interval}s, poll=\${poll_interval}s)"

  local last_hb=\$(date +%s) last_poll=\$(date +%s) now
  while true; do
    now=\$(date +%s)
    (( now - last_hb >= heartbeat_interval )) && { send_heartbeat; last_hb=\$(date +%s); }
    (( now - last_poll >= poll_interval )) && { poll_jobs; last_poll=\$(date +%s); }
    sleep 2
  done
}

main "\$@"
`;
