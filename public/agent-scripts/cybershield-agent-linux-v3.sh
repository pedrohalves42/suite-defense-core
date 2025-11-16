#!/usr/bin/env bash
# CyberShield Agent - Linux
# Version: v3.0.0 (HMAC HEX, Jobs + Reports, Post-Installation)

set -euo pipefail

########################################
# PARÂMETROS
########################################

SERVER_URL="${SERVER_URL:-}"
AGENT_TOKEN="${AGENT_TOKEN:-}"
HMAC_SECRET="${HMAC_SECRET:-}"
AGENT_NAME="${AGENT_NAME:-$(hostname -s)}"
AGENT_VERSION="${AGENT_VERSION:-3.0.0}"

# Permitir também via argumentos (fallback)
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
      echo "Parâmetro desconhecido: $1" >&2
      exit 1;;
  esac
done

if [[ -z "$SERVER_URL" || -z "$AGENT_TOKEN" || -z "$HMAC_SECRET" ]]; then
  echo "Uso: SERVER_URL=... AGENT_TOKEN=... HMAC_SECRET=... ./cybershield-agent-linux.sh"
  echo "ou:  ./cybershield-agent-linux.sh --server-url ... --agent-token ... --hmac-secret ..."
  exit 1
fi

SERVER_URL="${SERVER_URL%/}" # remove trailing slash

########################################
# LOG
########################################

LOG_DIR="/var/log/cybershield"
LOG_FILE="$LOG_DIR/agent.log"

mkdir -p "$LOG_DIR" || true
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
    log "ERROR" "HMAC_SECRET inválido. Esperado 64 caracteres hexadecimais, recebido length=${#HMAC_SECRET}"
    exit 1
  fi
}

hmac_sign() {
  local message="$1"
  # Secret é HEX → usar hexkey
  # openssl dgst -sha256 -mac HMAC -macopt hexkey:...
  printf '%s' "$message" \
    | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$HMAC_SECRET" \
    | awk '{print $2}'
}

########################################
# REQUISIÇÃO SEGURA
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
    # timestamp em ms (aprox): segundos * 1000
    timestamp=$(( $(date +%s) * 1000 ))
    if command -v uuidgen >/dev/null 2>&1; then
      nonce="$(uuidgen)"
    else
      nonce="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "nonce-$(date +%s)")"
    fi

    payload="${timestamp}:${nonce}:${body}"

    signature="$(hmac_sign "$payload")"

    log "DEBUG" "Request $method $url (body_length=${#body})"

    # curl: resposta + http_code na última linha
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
      log "ERROR" "Erro de autenticação (401). Verifique AgentToken / HmacSecret / clock."
      return 1
    fi

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
      return 0
    fi

    retry_count=$((retry_count+1))
    if (( retry_count >= max_retries )); then
      log "ERROR" "Falha definitiva após $max_retries tentativas em $url (status=$http_code)"
      return 1
    fi

    log "WARN" "Tentativa $retry_count falhou (status=$http_code). Aguardando ${retry_delay}s para retry..."
    sleep "$retry_delay"
    retry_delay=$((retry_delay * 2))
  done
}

########################################
# SYSTEM INFO / METRICS
########################################

system_info_json() {
  local os_name os_version hostname total_ram_gb
  os_name="$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-Linux}")"
  os_version="$(uname -r)"
  hostname="$(hostname -s)"
  total_ram_gb="$(free -m 2>/dev/null | awk '/Mem:/ {printf "%.2f", $2/1024}')"

  jq -n \
    --arg os_type "Linux" \
    --arg os_name "$os_name" \
    --arg os_version "$os_version" \
    --arg hostname "$hostname" \
    --arg total_ram_gb "$total_ram_gb" \
    --arg agent_name "$AGENT_NAME" \
    --arg agent_version "$AGENT_VERSION" \
    '{
      os_type: $os_type,
      os_name: $os_name,
      os_version: $os_version,
      hostname: $hostname,
      total_ram_gb: ($total_ram_gb|tonumber),
      agent_name: $agent_name,
      agent_version: $agent_version
    }'
}

system_metrics_json() {
  local cpu_load ram_used
  # CPU load (médio) - aproximado
  cpu_load="$(awk -F' ' '/cpu /{u=$2; n=$3; s=$4; i=$5; w=$6; irq=$7; soft=$8; steal=$9; idle=i+w; busy=u+n+s+irq+soft+steal; print busy/(busy+idle)*100}' /proc/stat 2>/dev/null | head -n1)"
  cpu_load="${cpu_load:-0}"

  # RAM
  if free -m >/dev/null 2>&1; then
    ram_used="$(free -m | awk '/Mem:/ {printf "%.2f", ($3/$2)*100}')"
  else
    ram_used="0"
  fi

  jq -n \
    --arg cpu_load "$cpu_load" \
    --arg ram_used "$ram_used" \
    '{
      cpu_load_percent: ($cpu_load|tonumber),
      ram_used_percent: ($ram_used|tonumber)
    }'
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
      --arg platform "linux" \
      --arg installation_method "one_click" \
      --arg success_b "$success" \
      --arg error_message "$error_message" \
      --arg agent_version "$AGENT_VERSION" \
      --argjson metadata "$(
        jq -n \
          --argjson sys "$sys_json" \
          --argjson metrics "$metrics_json" \
          '{os_name: $sys.os_name, os_version: $sys.os_version, hostname: $sys.hostname, total_ram_gb: $sys.total_ram_gb, cpu_load: $metrics.cpu_load_percent, ram_used: $metrics.ram_used_percent}'
      )" \
      --arg install_time "$install_time" \
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
      --arg platform "linux" \
      --arg agent_version "$AGENT_VERSION" \
      --argjson sys "$sys_json" \
      --argjson metrics "$metrics_json" \
      '{
        agent_name: $agent_name,
        platform: $platform,
        os_name: $sys.os_name,
        os_version: $sys.os_version,
        hostname: $sys.hostname,
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
  local status="$2"     # completed | failed
  local output_json="$3"
  local error_message="${4:-""}"
  local exec_time="${5:-0}"

  local body
  body="$(
    jq -n \
      --arg job_id "$job_id" \
      --arg status "$status" \
      --arg error_message "$error_message" \
      --arg exec_time "$exec_time" \
      --argjson output "$output_json" \
      '{
        job_id: $job_id,
        status: $status,
        output: $output,
        error_message: $error_message,
        execution_time_seconds: ($exec_time|tonumber)
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
# EXECUÇÃO DE JOB
########################################

execute_job() {
  local job_id="$1"
  local job_type="$2"
  local payload_json="$3"

  log "INFO" "Executando job $job_id (type=$job_type)"
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

    *)
      status="failed"
      error_msg="Tipo de job não suportado: $job_type"
      output_json="$(jq -n --arg error "$error_msg" '{error: $error}')"
      ;;

  esac

  local end_ts exec_time
  end_ts=$(date +%s)
  exec_time=$(( end_ts - start_ts ))

  if [[ "$status" == "completed" ]]; then
    submit_job_result "$job_id" "completed" "$output_json" "" "$exec_time"
  else
    log "ERROR" "$error_msg"
    submit_job_result "$job_id" "failed" "$output_json" "$error_msg" "$exec_time"
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
    log "INFO" "Nenhum job disponível"
    return
  fi

  log "INFO" "Recebidos $count job(s) no poll-jobs"

  printf '%s\n' "$jobs_json" | jq -c '.[]' | while read -r job; do
    local job_id job_type payload_json
    job_id="$(printf '%s\n' "$job" | jq -r '.id')"
    job_type="$(printf '%s\n' "$job" | jq -r '.type')"
    payload_json="$(printf '%s\n' "$job" | jq -c '.payload // {}')"

    execute_job "$job_id" "$job_type" "$payload_json"
  done
}

########################################
# LOOP PRINCIPAL
########################################

main() {
  validate_hmac_secret

  local heartbeat_interval=30
  local poll_interval=30

  log "INFO" "============================================"
  log "INFO" "Iniciando CyberShield Agent - Linux v$AGENT_VERSION"
  log "INFO" "ServerUrl = $SERVER_URL"
  log "INFO" "AgentName = $AGENT_NAME"

  local bootstrap_start bootstrap_elapsed
  bootstrap_start=$(date +%s)

  # post_installation
  send_post_installation "true" "" "0"

  # primeiro heartbeat
  send_heartbeat

  bootstrap_elapsed=$(( $(date +%s) - bootstrap_start ))
  log "INFO" "Bootstrap concluído em ${bootstrap_elapsed}s"

  log "INFO" "Entrando no loop principal (heartbeat=${heartbeat_interval}s, poll=${poll_interval}s)"

  local last_hb last_poll now
  last_hb=$(date +%s)
  last_poll=$(date +%s)

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

    sleep 2
  done
}

main "$@"
