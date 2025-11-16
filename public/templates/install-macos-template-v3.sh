#!/usr/bin/env bash
# CyberShield - Instalador macOS v3.0.0
# Template: valores {{PLACEHOLDER}} são substituídos no backend.

set -euo pipefail

########################################
# VARIÁVEIS DE TEMPLATE
########################################
SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

########################################
# CONFIG / PATHS
########################################
INSTALL_DIR="/Library/CyberShield"
BIN_PATH="$INSTALL_DIR/cybershield-agent-macos.sh"
PLIST_PATH="/Library/LaunchDaemons/com.cybershield.agent.plist"
LOG_DIR="/Library/Logs/CyberShield"

########################################
# LOG
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
chown root:wheel "$BIN_PATH" || true

########################################
# CRIAR LAUNCHDAEMON
########################################
log "INFO" "Criando LaunchDaemon em $PLIST_PATH..."

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>

    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/env</string>
      <string>SERVER_URL=$SERVER_URL</string>
      <string>AGENT_TOKEN=$AGENT_TOKEN</string>
      <string>HMAC_SECRET=$HMAC_SECRET</string>
      <string>AGENT_NAME=$AGENT_NAME</string>
      <string>AGENT_VERSION=$AGENT_VERSION</string>
      <string>bash</string>
      <string>$BIN_PATH</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent.log</string>

    <key>KeepAlive</key>
    <true/>

    <key>EnvironmentVariables</key>
    <dict>
      <key>CYBERSHIELD_ENV</key>
      <string>production</string>
    </dict>
  </dict>
</plist>
EOF

chown root:wheel "$PLIST_PATH"
chmod 644 "$PLIST_PATH"

########################################
# CARREGAR LAUNCHDAEMON
########################################
log "INFO" "Carregando LaunchDaemon com launchctl..."

# Se já existir, descarrega primeiro
if launchctl list | grep -q "com.cybershield.agent"; then
  log "INFO" "Removendo LaunchDaemon anterior..."
  launchctl bootout system "$PLIST_PATH" 2>/dev/null || true
fi

launchctl bootstrap system "$PLIST_PATH" 2>/dev/null \
  || launchctl load "$PLIST_PATH" 2>/dev/null \
  || fail "Falha ao carregar LaunchDaemon."

sleep 2

if launchctl list | grep -q "com.cybershield.agent"; then
  log "SUCCESS" "✅ CyberShield Agent instalado com sucesso!"
  echo ""
  echo "============================================"
  echo "  CyberShield Agent - macOS v$AGENT_VERSION"
  echo "============================================"
  echo ""
  echo "✅ Status: RUNNING"
  echo "📂 Logs: $LOG_DIR/agent.log"
  echo "🔧 Comandos úteis:"
  echo "   • Ver logs:    tail -f $LOG_DIR/agent.log"
  echo "   • Ver status:  sudo launchctl list | grep cybershield"
  echo "   • Parar:       sudo launchctl stop com.cybershield.agent"
  echo "   • Descarregar: sudo launchctl bootout system $PLIST_PATH"
  echo ""
else
  fail "LaunchDaemon não está rodando. Veja logs em $LOG_DIR/agent.log"
fi
