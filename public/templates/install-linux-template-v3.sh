#!/usr/bin/env bash
# CyberShield - Instalador Linux v3.0.0
# Este arquivo é um TEMPLATE. Os valores {{PLACEHOLDER}} serão
# substituídos pelo backend antes do download para o cliente.

set -euo pipefail

########################################
# VARIÁVEIS DE TEMPLATE (substituídas no backend)
########################################
SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

########################################
# CONFIGURAÇÃO / PATHS
########################################
INSTALL_DIR="/opt/cybershield"
BIN_PATH="$INSTALL_DIR/cybershield-agent-linux.sh"
SERVICE_NAME="cybershield-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
LOG_DIR="/var/log/cybershield"

########################################
# FUNÇÕES DE LOG
########################################
log() {
  local level="$1"; shift
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] [$level] $*"
}

fail() {
  log "ERROR" "$*"
  exit 1
}

########################################
# CHECAGEM DE ROOT
########################################
if [[ "$EUID" -ne 0 ]]; then
  fail "Este instalador precisa ser executado como root (sudo)."
fi

########################################
# CHECAR DEPENDÊNCIAS
########################################
need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Dependência ausente: $1"
}

log "INFO" "Verificando dependências..."
need_cmd curl
need_cmd bash
need_cmd openssl
need_cmd jq

########################################
# CRIAR DIRETÓRIOS
########################################
log "INFO" "Criando diretórios em $INSTALL_DIR e $LOG_DIR..."
mkdir -p "$INSTALL_DIR" "$LOG_DIR"

########################################
# BAIXAR SCRIPT DO AGENTE
########################################
log "INFO" "Baixando agente a partir de: $AGENT_SCRIPT_URL"
curl -fsSL "$AGENT_SCRIPT_URL" -o "$BIN_PATH" \
  || fail "Falha ao baixar o script do agente."

chmod +x "$BIN_PATH"

########################################
# CRIAR UNIT DO SYSTEMD
########################################

log "INFO" "Criando service unit em $SERVICE_FILE..."

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=CyberShield Agent (Linux)
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/env \\
  SERVER_URL=$SERVER_URL \\
  AGENT_TOKEN=$AGENT_TOKEN \\
  HMAC_SECRET=$HMAC_SECRET \\
  AGENT_NAME=$AGENT_NAME \\
  AGENT_VERSION=$AGENT_VERSION \\
  bash $BIN_PATH
Restart=always
RestartSec=10
User=root
Group=root
StandardOutput=append:$LOG_DIR/agent.log
StandardError=append:$LOG_DIR/agent.log
Environment=CYBERSHIELD_ENV=production

[Install]
WantedBy=multi-user.target
EOF

########################################
# RELOAD / ENABLE / START
########################################
log "INFO" "Recarregando systemd..."
systemctl daemon-reload

log "INFO" "Habilitando serviço $SERVICE_NAME na inicialização..."
systemctl enable "$SERVICE_NAME"

log "INFO" "Iniciando serviço $SERVICE_NAME..."
systemctl start "$SERVICE_NAME"

sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
  log "SUCCESS" "✅ CyberShield Agent instalado com sucesso!"
  echo ""
  echo "============================================"
  echo "  CyberShield Agent - Linux v$AGENT_VERSION"
  echo "============================================"
  echo ""
  echo "✅ Status: RUNNING"
  echo "📂 Logs: $LOG_DIR/agent.log"
  echo "🔧 Comandos úteis:"
  echo "   • Ver logs:    tail -f $LOG_DIR/agent.log"
  echo "   • Ver status:  systemctl status $SERVICE_NAME"
  echo "   • Parar:       systemctl stop $SERVICE_NAME"
  echo "   • Iniciar:     systemctl start $SERVICE_NAME"
  echo "   • Reiniciar:   systemctl restart $SERVICE_NAME"
  echo ""
else
  log "ERROR" "O serviço não está rodando."
  echo ""
  echo "⚠️  Verifique os logs:"
  echo "   systemctl status $SERVICE_NAME"
  echo "   tail -n 50 $LOG_DIR/agent.log"
  echo ""
  exit 1
fi
