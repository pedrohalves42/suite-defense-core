#!/bin/bash
# CyberShield Agent - Linux Bash Script com HMAC
# Versão: 2.0 com autenticação HMAC e rate limiting

set -e

# Parâmetros
AGENT_TOKEN="${1}"
HMAC_SECRET="${2}"
SERVER_URL="${3}"
POLL_INTERVAL="${4:-60}"

if [ -z "$AGENT_TOKEN" ] || [ -z "$HMAC_SECRET" ] || [ -z "$SERVER_URL" ]; then
    echo "Uso: $0 <AGENT_TOKEN> <HMAC_SECRET> <SERVER_URL> [POLL_INTERVAL]"
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
    echo "CyberShield Agent v2.0 - Iniciando"
    echo "==================================="
    echo "Servidor: $SERVER_URL"
    echo "Intervalo: $POLL_INTERVAL segundos"
    echo "HMAC: Habilitado"
    echo ""
    
    while true; do
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
        
        # Aguardar próximo polling
        sleep $POLL_INTERVAL
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

# Verificar dependências
if ! command -v jq &> /dev/null; then
    echo "[WARN] jq não encontrado, instalando..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y jq
    elif command -v yum &> /dev/null; then
        yum install -y jq
    fi
fi

# Iniciar agente
start_agent
