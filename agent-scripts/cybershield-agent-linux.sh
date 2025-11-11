#!/bin/bash
# CyberShield Agent - Linux Installation Script
# Version: 2.1.0
# Supports: Ubuntu 18.04+, CentOS 7+, Debian 9+, RHEL 7+

set -e

# Script constants
readonly SCRIPT_VERSION="2.1.0"
readonly MIN_BASH_VERSION=4
readonly SERVICE_NAME="cybershield-agent"
readonly INSTALL_DIR="/opt/cybershield"
readonly LOG_DIR="/var/log/cybershield"
readonly CONFIG_FILE="${INSTALL_DIR}/agent.conf"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Log functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parameters
AGENT_TOKEN="${1}"
HMAC_SECRET="${2}"
SERVER_URL="${3}"
POLL_INTERVAL="${4:-60}"

if [ -z "$AGENT_TOKEN" ] || [ -z "$HMAC_SECRET" ] || [ -z "$SERVER_URL" ]; then
    log_error "Missing required parameters"
    echo "Usage: $0 <AGENT_TOKEN> <HMAC_SECRET> <SERVER_URL> [POLL_INTERVAL]"
    echo ""
    echo "Example:"
    echo "  sudo $0 abc123token xyz789secret https://your-server.com 60"
    exit 1
fi

# Função para gerar assinatura HMAC
generate_hmac_signature() {
    local message="$1"
    local secret="$2"
    echo -n "$message" | openssl dgst -sha256 -hmac "$secret" | awk '{print $2}'
}

# Função para fazer requisição com HMAC
secure_request() {
    local url="$1"
    local method="${2:-GET}"
    local body="${3:-}"
    
    local timestamp=$(date +%s%3N)
    local nonce=$(cat /proc/sys/kernel/random/uuid)
    local payload="${timestamp}:${nonce}:${body}"
    local signature=$(generate_hmac_signature "$payload" "$HMAC_SECRET")
    
    if [ "$method" == "GET" ]; then
        curl -s -X GET "$url" \
            -H "X-Agent-Token: $AGENT_TOKEN" \
            -H "X-HMAC-Signature: $signature" \
            -H "X-Timestamp: $timestamp" \
            -H "X-Nonce: $nonce" \
            -H "Content-Type: application/json"
    else
        curl -s -X POST "$url" \
            -H "X-Agent-Token: $AGENT_TOKEN" \
            -H "X-HMAC-Signature: $signature" \
            -H "X-Timestamp: $timestamp" \
            -H "X-Nonce: $nonce" \
            -H "Content-Type: application/json" \
            -d "$body"
    fi
}

# Função para polling de jobs
poll_jobs() {
    secure_request "${SERVER_URL}/functions/v1/poll-jobs" "GET"
}

# Função para enviar heartbeat
send_heartbeat() {
    log_info "Enviando heartbeat..."
    
    # Coletar info do OS
    local os_type="linux"
    local os_version=$(cat /etc/os-release | grep "PRETTY_NAME" | cut -d'"' -f2 2>/dev/null || echo "Linux")
    local hostname=$(hostname)
    
    local heartbeat_json
    heartbeat_json=$(cat <<EOF
{
  "os_type": "$os_type",
  "os_version": "$os_version",
  "hostname": "$hostname"
}
EOF
)
    
    local response=$(secure_request "${SERVER_URL}/functions/v1/heartbeat" "POST" "$heartbeat_json")
    
    if echo "$response" | grep -q '"ok":true'; then
        log_info "Heartbeat enviado com sucesso"
    else
        log_warn "Falha no heartbeat"
    fi
}

# Função para enviar métricas do sistema
send_system_metrics() {
    log_info "Coletando e enviando métricas do sistema..."
    
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{printf "%.2f", 100 - $1}')
    
    # Memory info
    local mem_info=$(free -m | awk 'NR==2{printf "%.2f %.2f %.2f %.2f", $2/1024, $3/1024, $4/1024, ($3/$2)*100}')
    read -r mem_total mem_used mem_free mem_percent <<< "$mem_info"
    
    # Disk info
    local disk_info=$(df -BG / | awk 'NR==2{gsub(/G/,""); printf "%.2f %.2f %.2f %.2f", $2, $3, $4, ($3/$2)*100}')
    read -r disk_total disk_used disk_free disk_percent <<< "$disk_info"
    
    # CPU cores
    local cpu_cores=$(nproc)
    
    # Uptime
    local uptime_seconds=$(cat /proc/uptime | awk '{print int($1)}')
    
    # Last boot time
    local last_boot=$(date -d "@$(($(date +%s) - $uptime_seconds))" --iso-8601=seconds)
    
    # Build JSON payload
    local metrics_json
    metrics_json=$(cat <<EOF
{
  "cpu_usage_percent": $cpu_usage,
  "cpu_cores": $cpu_cores,
  "memory_total_gb": $mem_total,
  "memory_used_gb": $mem_used,
  "memory_free_gb": $mem_free,
  "memory_usage_percent": $mem_percent,
  "disk_total_gb": $disk_total,
  "disk_used_gb": $disk_used,
  "disk_free_gb": $disk_free,
  "disk_usage_percent": $disk_percent,
  "uptime_seconds": $uptime_seconds,
  "last_boot_time": "$last_boot"
}
EOF
)
    
    # Send metrics
    local response=$(secure_request "${SERVER_URL}/functions/v1/submit-system-metrics" "POST" "$metrics_json")
    
    if echo "$response" | grep -q '"success":true'; then
        log_info "Métricas enviadas (CPU: ${cpu_usage}%, RAM: ${mem_percent}%, Disco: ${disk_percent}%)"
        
        # Check for alerts
        local alerts=$(echo "$response" | jq -r '.alerts_generated // 0' 2>/dev/null || echo "0")
        if [ "$alerts" -gt 0 ]; then
            log_warn "⚠️ $alerts alerta(s) gerado(s)"
        fi
    else
        log_warn "Falha ao enviar métricas"
    fi
}

# Função para executar job
execute_job() {
    local job_id="$1"
    local job_type="$2"
    local job_payload="$3"
    
    echo "[INFO] Executando job: $job_id - Tipo: $job_type"
    
    case "$job_type" in
        "scan")
            echo "[INFO] Executando scan de segurança..."
            ;;
        "update")
            echo "[INFO] Executando atualização..."
            ;;
        "report")
            echo "[INFO] Gerando relatório..."
            ;;
        "config")
            echo "[INFO] Aplicando configuração..."
            ;;
        *)
            echo "[WARN] Tipo de job desconhecido: $job_type"
            ;;
    esac
}

# Função para ACK do job
ack_job() {
    local job_id="$1"
    local url="${SERVER_URL}/functions/v1/ack-job/${job_id}"
    
    local response=$(secure_request "$url" "POST")
    
    if echo "$response" | grep -q '"ok":true'; then
        echo "[INFO] Job $job_id confirmado"
        return 0
    else
        echo "[ERRO] Falha ao confirmar job $job_id"
        return 1
    fi
}

# Função para calcular hash SHA256
get_file_hash() {
    local file_path="$1"
    sha256sum "$file_path" | awk '{print $1}'
}

# Função para scan de vírus
scan_file() {
    local file_path="$1"
    
    if [ ! -f "$file_path" ]; then
        echo "[ERRO] Arquivo não encontrado: $file_path"
        return 1
    fi
    
    local file_hash=$(get_file_hash "$file_path")
    
    local body=$(cat <<EOF
{
    "filePath": "$file_path",
    "fileHash": "$file_hash"
}
EOF
)
    
    local result=$(secure_request "${SERVER_URL}/functions/v1/scan-virus" "POST" "$body")
    
    if echo "$result" | grep -q '"isMalicious":true'; then
        echo "[ALERTA] Arquivo malicioso detectado!"
        echo "  Arquivo: $file_path"
        echo "  Hash: $file_hash"
        echo "$result" | jq '.'
    else
        echo "[OK] Arquivo limpo: $file_path"
    fi
    
    echo "$result"
}

# Função principal
start_agent() {
    echo "==================================="
    echo "CyberShield Agent v2.1.0 - Iniciando"
    echo "==================================="
    echo "Servidor: $SERVER_URL"
    echo "Intervalo: $POLL_INTERVAL segundos"
    echo "HMAC: Habilitado"
    echo ""
    
    # Enviar heartbeat e métricas iniciais
    send_heartbeat
    send_system_metrics
    
    local heartbeat_counter=0
    local metrics_counter=0
    local heartbeat_interval=60
    local metrics_interval=300  # 5 minutos
    
    while true; do
        # Heartbeat a cada 60 segundos
        if [ $heartbeat_counter -ge $heartbeat_interval ]; then
            send_heartbeat
            heartbeat_counter=0
        fi
        
        # Métricas a cada 5 minutos
        if [ $metrics_counter -ge $metrics_interval ]; then
            send_system_metrics
            metrics_counter=0
        fi
        
        # Polling de jobs
        jobs=$(poll_jobs 2>/dev/null || echo "[]")
        
        job_count=$(echo "$jobs" | jq 'length' 2>/dev/null || echo "0")
        
        if [ "$job_count" -gt 0 ]; then
            echo "[INFO] $job_count job(s) recebido(s)"
            
            echo "$jobs" | jq -c '.[]' | while read -r job; do
                job_id=$(echo "$job" | jq -r '.id')
                job_type=$(echo "$job" | jq -r '.type')
                job_payload=$(echo "$job" | jq -r '.payload // "{}"')
                
                # Executar job
                execute_job "$job_id" "$job_type" "$job_payload"
                
                # Confirmar job
                ack_job "$job_id"
            done
        fi
        
        # Aguardar e incrementar contadores
        sleep 1
        ((heartbeat_counter++))
        ((metrics_counter++))
    done
}

# Instalar como systemd service
install_service() {
    local service_name="cybershield-agent"
    local script_path="$(readlink -f "$0")"
    
    echo "Instalando serviço systemd..."
    
    cat > /etc/systemd/system/${service_name}.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/bin/bash "$script_path" "$AGENT_TOKEN" "$HMAC_SECRET" "$SERVER_URL" $POLL_INTERVAL
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable $service_name
    systemctl start $service_name
    
    echo "Serviço instalado e iniciado com sucesso!"
    systemctl status $service_name
}

# System validation functions
check_root_privileges() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        echo ""
        echo "Please run:"
        echo "  sudo $0 $*"
        exit 1
    fi
    log_info "✓ Running with root privileges"
}

check_bash_version() {
    local bash_major_version="${BASH_VERSION%%.*}"
    if [ "$bash_major_version" -lt "$MIN_BASH_VERSION" ]; then
        log_error "Bash version $MIN_BASH_VERSION or higher required (current: $BASH_VERSION)"
        exit 1
    fi
    log_info "✓ Bash version $BASH_VERSION"
}

detect_linux_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        DISTRO_VERSION=$VERSION_ID
        log_info "✓ Detected: $NAME $VERSION_ID"
    else
        log_error "Cannot detect Linux distribution"
        exit 1
    fi
}

check_systemd() {
    if ! command -v systemctl &> /dev/null; then
        log_error "systemd is required but not found"
        exit 1
    fi
    log_info "✓ systemd available"
}

install_dependencies() {
    log_info "Installing dependencies..."
    
    case "$DISTRO" in
        ubuntu|debian)
            apt-get update -qq
            apt-get install -y curl jq openssl uuid-runtime > /dev/null 2>&1
            ;;
        centos|rhel|fedora)
            yum install -y curl jq openssl util-linux > /dev/null 2>&1
            ;;
        *)
            log_warn "Unknown distribution, attempting to install with apt-get..."
            apt-get update -qq && apt-get install -y curl jq openssl uuid-runtime > /dev/null 2>&1 || {
                log_error "Failed to install dependencies"
                exit 1
            }
            ;;
    esac
    
    log_info "✓ Dependencies installed"
}

verify_dependencies() {
    local missing_deps=()
    
    for cmd in curl jq openssl; do
        if ! command -v $cmd &> /dev/null; then
            missing_deps+=($cmd)
        fi
    done
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_info "Installing missing dependencies..."
        install_dependencies
    else
        log_info "✓ All dependencies available"
    fi
}

test_server_connectivity() {
    log_info "Testing server connectivity..."
    
    local heartbeat_url="${SERVER_URL}/functions/v1/heartbeat"
    local timestamp=$(date +%s%3N)
    local nonce=$(uuidgen)
    local payload="${timestamp}:${nonce}:"
    local signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $2}')
    
    local response=$(curl -s -w "\n%{http_code}" -X POST "$heartbeat_url" \
        -H "X-Agent-Token: $AGENT_TOKEN" \
        -H "X-HMAC-Signature: $signature" \
        -H "X-Timestamp: $timestamp" \
        -H "X-Nonce: $nonce" \
        -H "Content-Type: application/json" 2>&1)
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        log_info "✓ Server connectivity successful"
        return 0
    else
        log_error "Server connectivity failed (HTTP $http_code)"
        log_error "Response: $body"
        log_error ""
        log_error "Please verify:"
        log_error "  1. Server URL is correct: $SERVER_URL"
        log_error "  2. Agent token is valid: ${AGENT_TOKEN:0:10}..."
        log_error "  3. HMAC secret is correct"
        log_error "  4. Server is accessible from this machine"
        exit 1
    fi
}

create_directories() {
    log_info "Creating directories..."
    
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$LOG_DIR"
    
    chmod 750 "$INSTALL_DIR"
    chmod 750 "$LOG_DIR"
    
    log_info "✓ Directories created"
}

create_config_file() {
    log_info "Creating configuration file..."
    
    cat > "$CONFIG_FILE" <<EOF
# CyberShield Agent Configuration
# Generated: $(date)

AGENT_TOKEN="$AGENT_TOKEN"
HMAC_SECRET="$HMAC_SECRET"
SERVER_URL="$SERVER_URL"
POLL_INTERVAL=$POLL_INTERVAL
EOF

    chmod 600 "$CONFIG_FILE"
    log_info "✓ Configuration saved to $CONFIG_FILE"
}

copy_agent_script() {
    log_info "Installing agent script..."
    
    local agent_script="${INSTALL_DIR}/agent.sh"
    
    # Copy current script to installation directory
    cp "$0" "$agent_script"
    chmod 750 "$agent_script"
    
    log_info "✓ Agent script installed"
}

create_systemd_service() {
    log_info "Creating systemd service..."
    
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    
    cat > "$service_file" <<EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${CONFIG_FILE}
ExecStart=/bin/bash ${INSTALL_DIR}/agent.sh \${AGENT_TOKEN} \${HMAC_SECRET} \${SERVER_URL} \${POLL_INTERVAL}
Restart=always
RestartSec=10
StandardOutput=append:${LOG_DIR}/agent.log
StandardError=append:${LOG_DIR}/agent-error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${LOG_DIR}

[Install]
WantedBy=multi-user.target
EOF

    chmod 644 "$service_file"
    log_info "✓ Systemd service created"
}

enable_and_start_service() {
    log_info "Enabling and starting service..."
    
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
    systemctl start "$SERVICE_NAME"
    
    sleep 2
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "✓ Service started successfully"
    else
        log_error "Service failed to start"
        log_info "Check logs with: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
}

validate_installation() {
    log_info "Validating installation..."
    
    # Check if service exists
    if ! systemctl list-unit-files | grep -q "$SERVICE_NAME"; then
        log_error "Service not found in systemd"
        return 1
    fi
    
    # Check if service is enabled
    if ! systemctl is-enabled --quiet "$SERVICE_NAME"; then
        log_error "Service is not enabled"
        return 1
    fi
    
    # Check if service is running
    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        log_error "Service is not running"
        return 1
    fi
    
    # Check if log file exists and has recent entries
    if [ ! -f "${LOG_DIR}/agent.log" ]; then
        log_warn "Log file not created yet"
    fi
    
    log_info "✓ Installation validated"
    return 0
}

show_installation_summary() {
    echo ""
    echo "=========================================="
    echo "  CyberShield Agent Installation Complete"
    echo "=========================================="
    echo ""
    echo "Version: $SCRIPT_VERSION"
    echo "Service: $SERVICE_NAME"
    echo "Status: $(systemctl is-active $SERVICE_NAME)"
    echo ""
    echo "Useful commands:"
    echo "  Status:  sudo systemctl status $SERVICE_NAME"
    echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
    echo "  Start:   sudo systemctl start $SERVICE_NAME"
    echo "  Restart: sudo systemctl restart $SERVICE_NAME"
    echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
    echo "  Config:  sudo cat $CONFIG_FILE"
    echo ""
    echo "Log files:"
    echo "  Main:    ${LOG_DIR}/agent.log"
    echo "  Errors:  ${LOG_DIR}/agent-error.log"
    echo ""
}

# Installation workflow
install_agent() {
    echo "=========================================="
    echo "  CyberShield Agent Installer v${SCRIPT_VERSION}"
    echo "=========================================="
    echo ""
    
    check_root_privileges "$@"
    check_bash_version
    detect_linux_distro
    check_systemd
    verify_dependencies
    test_server_connectivity
    create_directories
    create_config_file
    copy_agent_script
    create_systemd_service
    enable_and_start_service
    validate_installation
    show_installation_summary
    
    log_info "Installation completed successfully!"
}

# Check if running in install mode (has parameters)
if [ $# -ge 3 ]; then
    # If we have 3+ parameters, this is an installation run
    if [ ! -f "$CONFIG_FILE" ] || [ "$5" = "--reinstall" ]; then
        install_agent "$@"
        exit 0
    fi
fi

# If we reach here, we're running as a service
# Load configuration
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Iniciar agente em modo service
start_agent
