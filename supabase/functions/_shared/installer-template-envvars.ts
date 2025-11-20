/**
 * Environment Variables Installer Templates v3.0.0
 * Alternative templates that use environment files instead of command-line arguments
 */

/**
 * Linux Installer Template v3 with Environment Variables
 * Uses /etc/cybershield-agent.env for secure credential storage
 */
export const LINUX_INSTALLER_TEMPLATE_V3_ENVVARS = `#!/usr/bin/env bash
# CyberShield - Instalador Linux v3.0.0 (Env Vars Mode)
# Este arquivo e um TEMPLATE. Os valores {{PLACEHOLDER}} serao
# substituidos pelo backend antes do download para o cliente.

set -euo pipefail

########################################
# VARIAVEIS DE TEMPLATE (substituidas no backend)
########################################
SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

########################################
# CONFIGURACAO / PATHS
########################################
INSTALL_DIR="/opt/cybershield"
BIN_PATH="\\$INSTALL_DIR/cybershield-agent-linux.sh"
ENV_FILE="/etc/cybershield-agent.env"
SERVICE_NAME="cybershield-agent"
SERVICE_FILE="/etc/systemd/system/\\$\{SERVICE_NAME\}.service"
LOG_DIR="/var/log/cybershield"

########################################
# FUNCOES DE LOG
########################################
log() {
  local level="\\$1"; shift
  local ts
  ts="\\$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[\\$ts] [\\$level] \\$*"
}

fail() {
  log "ERROR" "\\$*"
  exit 1
}

########################################
# CHECAGEM DE ROOT
########################################
if [[ "\\$EUID" -ne 0 ]]; then
  fail "Este instalador precisa ser executado como root (sudo)."
fi

########################################
# CHECAR DEPENDENCIAS
########################################
need_cmd() {
  command -v "\\$1" >/dev/null 2>&1 || fail "Dependencia ausente: \\$1"
}

log "INFO" "Verificando dependencias..."
need_cmd curl
need_cmd bash
need_cmd openssl
need_cmd jq

########################################
# CRIAR DIRETORIOS
########################################
log "INFO" "Criando diretorios em \\$INSTALL_DIR e \\$LOG_DIR..."
mkdir -p "\\$INSTALL_DIR" "\\$LOG_DIR"

########################################
# BAIXAR SCRIPT DO AGENTE
########################################
log "INFO" "Baixando agente a partir de: \\$AGENT_SCRIPT_URL"
curl -fsSL "\\$AGENT_SCRIPT_URL" -o "\\$BIN_PATH" \\
  || fail "Falha ao baixar o script do agente."

chmod +x "\\$BIN_PATH"

########################################
# CRIAR ARQUIVO DE ENVIRONMENT
########################################
log "INFO" "Criando arquivo de environment em \\$ENV_FILE (modo seguro)..."

cat > "\\$ENV_FILE" <<EOF
SERVER_URL=\\$SERVER_URL
AGENT_TOKEN=\\$AGENT_TOKEN
HMAC_SECRET=\\$HMAC_SECRET
AGENT_NAME=\\$AGENT_NAME
AGENT_VERSION=\\$AGENT_VERSION
EOF

chmod 600 "\\$ENV_FILE"
chown root:root "\\$ENV_FILE"

log "INFO" "Credenciais armazenadas em \\$ENV_FILE (acesso restrito a root)"

########################################
# CRIAR UNIT DO SYSTEMD
########################################

log "INFO" "Criando service unit em \\$SERVICE_FILE..."

cat > "\\$SERVICE_FILE" <<EOF
[Unit]
Description=CyberShield Agent (Linux)
After=network.target

[Service]
Type=simple
WorkingDirectory=\\$INSTALL_DIR
EnvironmentFile=\\$ENV_FILE
ExecStart=/usr/bin/bash \\$BIN_PATH
Restart=always
RestartSec=10
User=root
Group=root
StandardOutput=append:\\$LOG_DIR/agent.log
StandardError=append:\\$LOG_DIR/agent.log

[Install]
WantedBy=multi-user.target
EOF

########################################
# RELOAD / ENABLE / START
########################################
log "INFO" "Recarregando systemd..."
systemctl daemon-reload

log "INFO" "Habilitando servico \\$SERVICE_NAME na inicializacao..."
systemctl enable "\\$SERVICE_NAME"

log "INFO" "Iniciando servico \\$SERVICE_NAME..."
systemctl start "\\$SERVICE_NAME"

sleep 2

if systemctl is-active --quiet "\\$SERVICE_NAME"; then
  log "SUCCESS" "[OK]  CyberShield Agent instalado com sucesso!"
  echo ""
  echo "============================================"
  echo "CyberShield Agent instalado e rodando!"
  echo "============================================"
  echo ""
  echo "Logs do agente:     \\$LOG_DIR/agent.log"
  echo "Arquivo de config:  \\$ENV_FILE (somente root)"
  echo ""
  echo "Verificar status:   systemctl status \\$SERVICE_NAME"
  echo "Ver logs:           journalctl -u \\$SERVICE_NAME -f"
  echo "Parar servico:      systemctl stop \\$SERVICE_NAME"
  echo ""
else
  fail "Falha ao iniciar o servico. Verifique: journalctl -u \\$SERVICE_NAME"
fi
`;

/**
 * macOS Installer Template v3 with Environment Variables
 * Uses LaunchDaemon with EnvironmentVariables in plist
 */
export const MACOS_INSTALLER_TEMPLATE_V3_ENVVARS = `#!/usr/bin/env bash
# CyberShield - Instalador macOS v3.0.0 (Env Vars Mode)
# Este arquivo e um TEMPLATE. Os valores {{PLACEHOLDER}} serao
# substituidos pelo backend antes do download para o cliente.

set -euo pipefail

########################################
# VARIAVEIS DE TEMPLATE (substituidas no backend)
########################################
SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

########################################
# CONFIGURACAO / PATHS
########################################
INSTALL_DIR="/Library/CyberShield"
BIN_PATH="\\$INSTALL_DIR/cybershield-agent-macos.sh"
PLIST_PATH="/Library/LaunchDaemons/com.cybershield.agent.plist"
LOG_DIR="/Library/Logs/CyberShield"

########################################
# FUNCOES DE LOG
########################################
log() {
  local level="\\$1"; shift
  local ts
  ts="\\$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[\\$ts] [\\$level] \\$*"
}

fail() {
  log "ERROR" "\\$*"
  exit 1
}

########################################
# CHECAGEM DE ROOT
########################################
if [[ "\\$EUID" -ne 0 ]]; then
  fail "Este instalador precisa ser executado como root (sudo)."
fi

########################################
# CHECAR DEPENDENCIAS
########################################
need_cmd() {
  command -v "\\$1" >/dev/null 2>&1 || fail "Dependencia ausente: \\$1 (instale via Homebrew se necessario)"
}

log "INFO" "Verificando dependencias..."
need_cmd curl
need_cmd bash
need_cmd openssl
need_cmd jq

########################################
# CRIAR DIRETORIOS
########################################
log "INFO" "Criando diretorios em \\$INSTALL_DIR e \\$LOG_DIR..."
mkdir -p "\\$INSTALL_DIR" "\\$LOG_DIR"

########################################
# BAIXAR SCRIPT DO AGENTE
########################################
log "INFO" "Baixando agente a partir de: \\$AGENT_SCRIPT_URL"
curl -fsSL "\\$AGENT_SCRIPT_URL" -o "\\$BIN_PATH" \\
  || fail "Falha ao baixar o script do agente."

chmod +x "\\$BIN_PATH"

########################################
# CRIAR LAUNCHDAEMON
########################################

log "INFO" "Criando LaunchDaemon em \\$PLIST_PATH..."

cat > "\\$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cybershield.agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>\\$BIN_PATH</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>SERVER_URL</key>
    <string>\\$SERVER_URL</string>
    <key>AGENT_TOKEN</key>
    <string>\\$AGENT_TOKEN</string>
    <key>HMAC_SECRET</key>
    <string>\\$HMAC_SECRET</string>
    <key>AGENT_NAME</key>
    <string>\\$AGENT_NAME</string>
    <key>AGENT_VERSION</key>
    <string>\\$AGENT_VERSION</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>\\$INSTALL_DIR</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>\\$LOG_DIR/agent.log</string>

  <key>StandardErrorPath</key>
  <string>\\$LOG_DIR/agent.log</string>
</dict>
</plist>
EOF

chmod 644 "\\$PLIST_PATH"
chown root:wheel "\\$PLIST_PATH"

########################################
# LOAD / START
########################################

log "INFO" "Descarregando LaunchDaemon anterior (se existir)..."
launchctl unload "\\$PLIST_PATH" 2>/dev/null || true

log "INFO" "Carregando LaunchDaemon..."
launchctl load -w "\\$PLIST_PATH" \\
  || fail "Falha ao carregar LaunchDaemon."

sleep 2

if launchctl list | grep -q "com.cybershield.agent"; then
  log "SUCCESS" "[OK]  CyberShield Agent instalado com sucesso!"
  echo ""
  echo "============================================"
  echo "CyberShield Agent instalado e rodando!"
  echo "============================================"
  echo ""
  echo "Logs do agente:     \\$LOG_DIR/agent.log"
  echo "LaunchDaemon plist: \\$PLIST_PATH"
  echo ""
  echo "Verificar status:   launchctl list | grep cybershield"
  echo "Ver logs:           tail -f \\$LOG_DIR/agent.log"
  echo "Parar servico:      launchctl unload \\$PLIST_PATH"
  echo ""
else
  fail "Falha ao iniciar o servico. Verifique os logs em \\$LOG_DIR/agent.log"
fi
`;
