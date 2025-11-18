/**
 * ⚠️ CRITICAL: Single Source of Truth for Installers
 * 
 * This file is the ONLY authoritative template for Windows/Linux/macOS installers.
 * Do NOT create parallel versions in public/templates/ or other locations.
 * 
 * All changes to installers MUST be made here to ensure consistency across:
 * - serve-installer Edge Function (runtime generation)
 * - build-agent-exe Edge Function (EXE compilation)
 * 
 * Last synchronized: 2025-01-18 (v3.1.0-HARDENED Windows template)
 */

export const WINDOWS_INSTALLER_TEMPLATE = String.raw`# CyberShield Agent - Windows Installation Script v3.1.0-HARDENED
# Auto-generated: {{TIMESTAMP}}
# Hardened Build - Production-Ready with Self-Test & Auto-Cleanup

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v3.1.0-HARDENED" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERRO: Este script requer privilégios de administrador" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "ERRO: Este script requer PowerShell 5.1 ou superior" -ForegroundColor Red
    exit 1
}

$AgentToken = "{{AGENT_TOKEN}}"
$HmacSecret = "{{HMAC_SECRET}}"
$ServerUrl = "{{SERVER_URL}}"
$PollInterval = 60

if ([string]::IsNullOrWhiteSpace($AgentToken) -or $AgentToken -eq "{{AGENT_TOKEN}}") {
    Write-Host "ERRO: Token do agente não configurado" -ForegroundColor Red
    exit 1
}

$TokenPrefix = $AgentToken.Substring(0, 8)
$HmacPrefix = $HmacSecret.Substring(0, 8)
Write-Host "[INFO] AgentToken: $TokenPrefix... HmacSecret: $HmacPrefix..." -ForegroundColor Gray

$InstallDir = "C:\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"

function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    "$timestamp - $Message" | Out-File $InstallLog -Append
    Write-Host $Message
}

Write-Host ""
Write-Host "[1/7] Limpando instalações anteriores..." -ForegroundColor Yellow

$oldTasks = Get-ScheduledTask | Where-Object { $_.TaskName -match 'CyberShield' }
if ($oldTasks) {
    Write-InstallLog "Encontradas $($oldTasks.Count) task(s) antiga(s)"
    foreach ($task in $oldTasks) {
        try {
            Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue
        } catch {}
    }
}

$oldProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'cybershield-agent' }
if ($oldProcesses) {
    foreach ($proc in $oldProcesses) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-Host "[2/7] Criando diretórios..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

Write-Host "[3/7] Configurando rede..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "[4/7] Instalando script do agente..." -ForegroundColor Yellow
$AgentContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@
Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8 -Force

Write-Host "[5/7] Criando tarefa agendada..." -ForegroundColor Yellow
$taskName = "CyberShield Agent"
$PowerShellExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

$action = New-ScheduledTaskAction -Execute $PowerShellExe -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$AgentScript\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -ServerUrl \`"$ServerUrl\`" -PollInterval $PollInterval"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "[6/7] Executando self-test..." -ForegroundColor Yellow
try {
    $timestamp = [int][double]::Parse((Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss"))
    $payload = '{"agent_token":"' + $AgentToken + '","timestamp":' + $timestamp + '}'
    $hmacsha256 = New-Object System.Security.Cryptography.HMACSHA256
    $hmacsha256.Key = [Text.Encoding]::UTF8.GetBytes($HmacSecret)
    $signature = [Convert]::ToBase64String($hmacsha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload)))
    
    $headers = @{
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp.ToString()
    }
    
    $response = Invoke-WebRequest -Uri "$ServerUrl/functions/v1/heartbeat" -Method POST -Headers $headers -Body $payload -ContentType "application/json" -TimeoutSec 15
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Self-test PASSOU - Credenciais validadas!" -ForegroundColor Green
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host ""
        Write-Host "❌ ERRO CRÍTICO: TOKEN OU HMAC SECRET INVÁLIDOS" -ForegroundColor Red
        Write-Host "Gere um NOVO instalador através do dashboard" -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        exit 401
    }
}

Write-Host "[7/7] Enviando telemetria..." -ForegroundColor Yellow
try {
    $telemetry = @{
        agent_name = "{{AGENT_NAME}}"
        success = $true
        platform = "windows"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$ServerUrl/functions/v1/post-installation-telemetry" -Method POST -Body $telemetry -ContentType "application/json" -TimeoutSec 15 | Out-Null
} catch {}

Write-Host ""
Write-Host "✅ INSTALAÇÃO CONCLUÍDA!" -ForegroundColor Green
Start-Sleep -Seconds 5
`;

/**
 * Linux Installer Template v3.0.0
 * Compatible with systemd-based distributions
 * Downloads agent script from storage URL
 */
export const LINUX_INSTALLER_TEMPLATE_V3 = `#!/usr/bin/env bash
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
BIN_PATH="\\$INSTALL_DIR/cybershield-agent-linux.sh"
SERVICE_NAME="cybershield-agent"
SERVICE_FILE="/etc/systemd/system/\\$\{SERVICE_NAME\}.service"
LOG_DIR="/var/log/cybershield"

########################################
# FUNÇÕES DE LOG
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
# CHECAR DEPENDÊNCIAS
########################################
need_cmd() {
  command -v "\\$1" >/dev/null 2>&1 || fail "Dependência ausente: \\$1"
}

log "INFO" "Verificando dependências..."
need_cmd curl
need_cmd bash
need_cmd openssl
need_cmd jq

########################################
# CRIAR DIRETÓRIOS
########################################
log "INFO" "Criando diretórios em \\$INSTALL_DIR e \\$LOG_DIR..."
mkdir -p "\\$INSTALL_DIR" "\\$LOG_DIR"

########################################
# BAIXAR SCRIPT DO AGENTE
########################################
log "INFO" "Baixando agente a partir de: \\$AGENT_SCRIPT_URL"
curl -fsSL "\\$AGENT_SCRIPT_URL" -o "\\$BIN_PATH" \\
  || fail "Falha ao baixar o script do agente."

chmod +x "\\$BIN_PATH"

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
ExecStart=/usr/bin/env \\\\
  SERVER_URL=\\$SERVER_URL \\\\
  AGENT_TOKEN=\\$AGENT_TOKEN \\\\
  HMAC_SECRET=\\$HMAC_SECRET \\\\
  AGENT_NAME=\\$AGENT_NAME \\\\
  AGENT_VERSION=\\$AGENT_VERSION \\\\
  bash \\$BIN_PATH
Restart=always
RestartSec=10
User=root
Group=root
StandardOutput=append:\\$LOG_DIR/agent.log
StandardError=append:\\$LOG_DIR/agent.log
Environment=CYBERSHIELD_ENV=production

[Install]
WantedBy=multi-user.target
EOF

########################################
# RELOAD / ENABLE / START
########################################
log "INFO" "Recarregando systemd..."
systemctl daemon-reload

log "INFO" "Habilitando serviço \\$SERVICE_NAME na inicialização..."
systemctl enable "\\$SERVICE_NAME"

log "INFO" "Iniciando serviço \\$SERVICE_NAME..."
systemctl start "\\$SERVICE_NAME"

sleep 2

if systemctl is-active --quiet "\\$SERVICE_NAME"; then
  log "SUCCESS" "✅ CyberShield Agent instalado com sucesso!"
  echo ""
  echo "============================================"
  echo "  CyberShield Agent - Linux v\\$AGENT_VERSION"
  echo "============================================"
  echo ""
  echo "✅ Status: RUNNING"
  echo "📂 Logs: \\$LOG_DIR/agent.log"
  echo "🔧 Comandos úteis:"
  echo "   • Ver logs:    tail -f \\$LOG_DIR/agent.log"
  echo "   • Ver status:  systemctl status \\$SERVICE_NAME"
  echo "   • Parar:       systemctl stop \\$SERVICE_NAME"
  echo "   • Iniciar:     systemctl start \\$SERVICE_NAME"
  echo "   • Reiniciar:   systemctl restart \\$SERVICE_NAME"
  echo ""
else
  log "ERROR" "O serviço não está rodando."
  echo ""
  echo "⚠️  Verifique os logs:"
  echo "   systemctl status \\$SERVICE_NAME"
  echo "   tail -n 50 \\$LOG_DIR/agent.log"
  echo ""
  exit 1
fi
`;

/**
 * macOS Installer Template v3.0.0
 * Compatible with LaunchDaemon
 * Downloads agent script from storage URL
 */
export const MACOS_INSTALLER_TEMPLATE_V3 = `#!/usr/bin/env bash
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
BIN_PATH="\\$INSTALL_DIR/cybershield-agent-macos.sh"
PLIST_PATH="/Library/LaunchDaemons/com.cybershield.agent.plist"
LOG_DIR="/Library/Logs/CyberShield"

########################################
# LOG
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
# CHECAR DEPENDÊNCIAS
########################################
need_cmd() {
  command -v "\\$1" >/dev/null 2>&1 || fail "Dependência ausente: \\$1"
}

log "INFO" "Verificando dependências..."
need_cmd curl
need_cmd bash
need_cmd openssl
need_cmd jq

########################################
# CRIAR DIRETÓRIOS
########################################
log "INFO" "Criando diretórios em \\$INSTALL_DIR e \\$LOG_DIR..."
mkdir -p "\\$INSTALL_DIR" "\\$LOG_DIR"

########################################
# BAIXAR SCRIPT DO AGENTE
########################################
log "INFO" "Baixando agente a partir de: \\$AGENT_SCRIPT_URL"
curl -fsSL "\\$AGENT_SCRIPT_URL" -o "\\$BIN_PATH" \\
  || fail "Falha ao baixar o script do agente."

chmod +x "\\$BIN_PATH"
chown root:wheel "\\$BIN_PATH" || true

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
      <string>/usr/bin/env</string>
      <string>SERVER_URL=\\$SERVER_URL</string>
      <string>AGENT_TOKEN=\\$AGENT_TOKEN</string>
      <string>HMAC_SECRET=\\$HMAC_SECRET</string>
      <string>AGENT_NAME=\\$AGENT_NAME</string>
      <string>AGENT_VERSION=\\$AGENT_VERSION</string>
      <string>bash</string>
      <string>\\$BIN_PATH</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>\\$LOG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>\\$LOG_DIR/agent.log</string>

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

chown root:wheel "\\$PLIST_PATH"
chmod 644 "\\$PLIST_PATH"

########################################
# CARREGAR LAUNCHDAEMON
########################################
log "INFO" "Carregando LaunchDaemon com launchctl..."

# Se já existir, descarrega primeiro
if launchctl list | grep -q "com.cybershield.agent"; then
  log "INFO" "Removendo LaunchDaemon anterior..."
  launchctl bootout system "\\$PLIST_PATH" 2>/dev/null || true
fi

launchctl bootstrap system "\\$PLIST_PATH" 2>/dev/null \\
  || launchctl load "\\$PLIST_PATH" 2>/dev/null \\
  || fail "Falha ao carregar LaunchDaemon."

sleep 2

if launchctl list | grep -q "com.cybershield.agent"; then
  log "SUCCESS" "✅ CyberShield Agent instalado com sucesso!"
  echo ""
  echo "============================================"
  echo "  CyberShield Agent - macOS v\\$AGENT_VERSION"
  echo "============================================"
  echo ""
  echo "✅ Status: RUNNING"
  echo "📂 Logs: \\$LOG_DIR/agent.log"
  echo "🔧 Comandos úteis:"
  echo "   • Ver logs:    tail -f \\$LOG_DIR/agent.log"
  echo "   • Ver status:  sudo launchctl list | grep cybershield"
  echo "   • Parar:       sudo launchctl stop com.cybershield.agent"
  echo "   • Descarregar: sudo launchctl bootout system \\$PLIST_PATH"
  echo ""
else
  fail "LaunchDaemon não está rodando. Veja logs em \\$LOG_DIR/agent.log"
fi
`;
