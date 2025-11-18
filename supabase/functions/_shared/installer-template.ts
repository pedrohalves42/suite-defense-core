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
 * Last synchronized: 2025-01-18 (v3.1.0-SIMPLIFIED Windows template)
 */

// Windows Installer Template - Simplified to ~100 lines
export const WINDOWS_INSTALLER_TEMPLATE = String.raw`
param(
  [Parameter(Mandatory = $true)]
  [string]$ServerUrl   = "{{SERVER_URL}}",

  [Parameter(Mandatory = $true)]
  [string]$AgentToken  = "{{AGENT_TOKEN}}",

  [Parameter(Mandatory = $true)]
  [string]$HmacSecret  = "{{HMAC_SECRET}}",

  [Parameter(Mandatory = $true)]
  [string]$AgentName   = "{{AGENT_NAME}}"
)

$BasePath  = "C:\CyberShield"
$LogsPath  = Join-Path $BasePath "logs"
$LogFile   = Join-Path $LogsPath "installer.log"

# Garante diretórios
New-Item -ItemType Directory -Path $BasePath -Force  | Out-Null
New-Item -ItemType Directory -Path $LogsPath -Force  | Out-Null

function Write-InstallerLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format o), $Level, $Message
    $line | Out-File -FilePath $LogFile -Append -Encoding UTF8
    Write-Host $line
}

Write-InstallerLog "Iniciando instalador CyberShield..." "INFO"

# Verifica se está em modo Admin
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-InstallerLog "Instalador não está em modo Administrador." "ERROR"
    Write-Host "❌ Este instalador precisa ser executado como Administrador." -ForegroundColor Red
    exit 1
}

Write-InstallerLog "Execução confirmada como Administrador." "INFO"

# Script completo do agente (injetado pelo backend)
$agentScript = @'
{{AGENT_SCRIPT_CONTENT}}
'@

$AgentScriptPath = "C:\CyberShield\cybershield-agent-windows-v3.ps1"
$agentScript | Out-File -FilePath $AgentScriptPath -Encoding UTF8 -Force

Write-InstallerLog "Script do agente criado em $AgentScriptPath" "INFO"

# Remover Scheduled Task antiga, se existir
$TaskName = "CyberShieldAgent"
$existingTask = $null
try {
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch { }

if ($existingTask) {
    Write-InstallerLog "Removendo Scheduled Task antiga '$TaskName'..." "INFO"
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
}

# Criar nova Scheduled Task (sem backticks de continuação)
$action = New-ScheduledTaskAction -Execute "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument '-ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\CyberShield\cybershield-agent-windows-v3.ps1" -ServerUrl "{{SERVER_URL}}" -AgentToken "{{AGENT_TOKEN}}" -HmacSecret "{{HMAC_SECRET}}" -AgentName "{{AGENT_NAME}}"'

$trigger = New-ScheduledTaskTrigger -AtStartup

$principalTask = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principalTask -Settings $settings -Description "CyberShield Security Agent v3"

Write-InstallerLog "Scheduled Task '$TaskName' criada." "INFO"

try {
    Start-ScheduledTask -TaskName $TaskName
    Write-InstallerLog "Scheduled Task '$TaskName' iniciada." "INFO"
} catch {
    Write-InstallerLog "Falha ao iniciar Scheduled Task '$TaskName': $($_.Exception.Message)" "ERROR"
    Write-Host "❌ Falha ao iniciar o serviço do agente. Verifique o Event Viewer." -ForegroundColor Red
    exit 1
}

Write-InstallerLog "Instalação concluída com sucesso." "SUCCESS"
Write-Host "✅ CyberShield Agent instalado com sucesso." -ForegroundColor Green
`;

// Linux Installer Template v3
export const LINUX_INSTALLER_TEMPLATE_V3 = `#!/bin/bash
set -e

# ========================================
# CyberShield Agent Installer for Linux
# Version: 3.0
# ========================================

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

BASE_PATH="/opt/cybershield"
LOGS_PATH="\${BASE_PATH}/logs"
AGENT_SCRIPT="\${BASE_PATH}/cybershield-agent-linux.sh"

echo "==================================="
echo "CyberShield Agent Installer v3.0"
echo "==================================="
echo ""

# Verificar root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Este script precisa ser executado como root."
  exit 1
fi

# Verificar dependências
for cmd in curl bash openssl jq; do
  if ! command -v \$cmd &> /dev/null; then
    echo "❌ Comando '\$cmd' não encontrado. Instale-o e tente novamente."
    exit 1
  fi
done

echo "✅ Dependências verificadas."

# Criar diretórios
mkdir -p "\${BASE_PATH}"
mkdir -p "\${LOGS_PATH}"

echo "✅ Diretórios criados: \${BASE_PATH}"

# Download do script do agente
echo "Baixando script do agente de \${AGENT_SCRIPT_URL}..."
curl -f -s -o "\${AGENT_SCRIPT}" "\${AGENT_SCRIPT_URL}" || {
  echo "❌ Falha ao baixar o script do agente."
  exit 1
}

chmod +x "\${AGENT_SCRIPT}"
echo "✅ Script do agente instalado."

# Criar serviço systemd
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=\${AGENT_SCRIPT}
Environment="SERVER_URL=\${SERVER_URL}"
Environment="AGENT_TOKEN=\${AGENT_TOKEN}"
Environment="HMAC_SECRET=\${HMAC_SECRET}"
Environment="AGENT_NAME=\${AGENT_NAME}"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

echo "✅ Serviço systemd configurado e iniciado."
echo ""
echo "==================================="
echo "Instalação concluída com sucesso!"
echo "==================================="
echo ""
echo "Para verificar o status: systemctl status cybershield-agent"
echo "Para ver logs: journalctl -u cybershield-agent -f"
`;

// macOS Installer Template v3
export const MACOS_INSTALLER_TEMPLATE_V3 = `#!/bin/bash
set -e

# ========================================
# CyberShield Agent Installer for macOS
# Version: 3.0
# ========================================

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

BASE_PATH="/opt/cybershield"
LOGS_PATH="\${BASE_PATH}/logs"
AGENT_SCRIPT="\${BASE_PATH}/cybershield-agent-macos.sh"

echo "==================================="
echo "CyberShield Agent Installer v3.0"
echo "==================================="
echo ""

# Verificar root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Este script precisa ser executado como root (sudo)."
  exit 1
fi

# Verificar dependências
for cmd in curl bash; do
  if ! command -v \$cmd &> /dev/null; then
    echo "❌ Comando '\$cmd' não encontrado."
    exit 1
  fi
done

echo "✅ Dependências verificadas."

# Criar diretórios
mkdir -p "\${BASE_PATH}"
mkdir -p "\${LOGS_PATH}"

echo "✅ Diretórios criados: \${BASE_PATH}"

# Download do script do agente
echo "Baixando script do agente de \${AGENT_SCRIPT_URL}..."
curl -f -s -o "\${AGENT_SCRIPT}" "\${AGENT_SCRIPT_URL}" || {
  echo "❌ Falha ao baixar o script do agente."
  exit 1
}

chmod +x "\${AGENT_SCRIPT}"
echo "✅ Script do agente instalado."

# Criar LaunchDaemon
cat > /Library/LaunchDaemons/com.cybershield.agent.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cybershield.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>\${AGENT_SCRIPT}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SERVER_URL</key>
    <string>\${SERVER_URL}</string>
    <key>AGENT_TOKEN</key>
    <string>\${AGENT_TOKEN}</string>
    <key>HMAC_SECRET</key>
    <string>\${HMAC_SECRET}</string>
    <key>AGENT_NAME</key>
    <string>\${AGENT_NAME}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>\${LOGS_PATH}/agent.log</string>
  <key>StandardErrorPath</key>
  <string>\${LOGS_PATH}/agent.error.log</string>
</dict>
</plist>
EOF

launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

echo "✅ LaunchDaemon configurado e iniciado."
echo ""
echo "==================================="
echo "Instalação concluída com sucesso!"
echo "==================================="
echo ""
echo "Para verificar o status: launchctl list | grep cybershield"
echo "Para ver logs: tail -f \${LOGS_PATH}/agent.log"
`;

