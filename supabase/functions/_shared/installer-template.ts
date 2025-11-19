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

// Windows Installer Template - Simplified and hardened
// Single source of truth with inline agent script using PowerShell here-string
export const WINDOWS_INSTALLER_TEMPLATE = String.raw`#Requires -RunAsAdministrator
#Requires -Version 5.1

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

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$BasePath  = "C:\CyberShield"
$LogsPath  = Join-Path $BasePath "logs"
$LogFile   = Join-Path $LogsPath "installer.log"

# Create directories
New-Item -ItemType Directory -Path $BasePath -Force  | Out-Null
New-Item -ItemType Directory -Path $LogsPath -Force  | Out-Null

# Logging helper
function Write-InstallerLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    $line | Out-File -FilePath $LogFile -Append -Encoding UTF8
    Write-Host $line
}

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v3.1.0" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

Write-InstallerLog "Iniciando instalação do CyberShield Agent..." "INFO"

# Verify Administrator privileges
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-InstallerLog "ERRO: Instalador não está em modo Administrador." "ERROR"
    Write-Host "❌ Este instalador precisa ser executado como Administrador." -ForegroundColor Red
    exit 1
}

Write-InstallerLog "Privilégios de Administrador verificados." "INFO"

# Verify PowerShell version
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-InstallerLog "ERRO: PowerShell 5.1+ é necessário." "ERROR"
    Write-Host "❌ Este script requer PowerShell 5.1 ou superior." -ForegroundColor Red
    exit 1
}

Write-InstallerLog "PowerShell versão $($PSVersionTable.PSVersion) detectado." "INFO"

# ===== Debug seguro de configuração do agente =====
try {
    $tokenPrefix = if ($AgentToken) {
        $AgentToken.Substring(0, [Math]::Min(8, $AgentToken.Length))
    } else {
        ''
    }

    $hmacPrefix = if ($HmacSecret) {
        $HmacSecret.Substring(0, [Math]::Min(8, $HmacSecret.Length))
    } else {
        ''
    }

    Write-InstallerLog "📋 Configuração do agente:" "INFO"
    Write-InstallerLog "  → ServerUrl: $ServerUrl" "INFO"
    Write-InstallerLog "  → AgentName: $AgentName" "INFO"
    Write-InstallerLog "  → Token (prefix): $tokenPrefix..." "INFO"
    Write-InstallerLog "  → HMAC (prefix): $hmacPrefix..." "INFO"
} catch {
    Write-InstallerLog "⚠ Falha ao logar prefixos de credenciais: $($_.Exception.Message)" "WARN"
}
# ================================================

# Agent script path
$AgentScriptPath = Join-Path $BasePath "cybershield-agent-windows-v3.ps1"

Write-Host "[1/4] Limpando instalações antigas..." -ForegroundColor Yellow

# Remove old Scheduled Task if exists
$TaskName = "CyberShieldAgent"
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    try {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-InstallerLog "Scheduled Task antiga removida: $TaskName" "INFO"
    } catch {
        Write-InstallerLog "Aviso: Não foi possível remover task antiga: $($_.Exception.Message)" "WARN"
    }
}

# Stop old agent processes
$oldProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'cybershield-agent' }
if ($oldProcesses) {
    Write-InstallerLog "Parando $($oldProcesses.Count) processo(s) antigo(s)..." "INFO"
    foreach ($proc in $oldProcesses) {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

Write-Host "[2/4] Instalando script do agente..." -ForegroundColor Yellow

# Create agent script inline (here-string for clean embedding)
$agentScriptContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

# Write agent script to disk (UTF8 without BOM to prevent parsing issues)
[System.IO.File]::WriteAllText($AgentScriptPath, $agentScriptContent, [System.Text.UTF8Encoding]::new($false))
Write-InstallerLog "Script do agente criado em: $AgentScriptPath" "INFO"

Write-Host "[3/4] Criando Scheduled Task..." -ForegroundColor Yellow

# Create new Scheduled Task
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$AgentScriptPath\`" -ServerUrl \`"$ServerUrl\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -AgentName \`"$AgentName\`""

$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "CyberShield Security Agent v3.0" -Force | Out-Null
    Write-InstallerLog "Scheduled Task criada: $TaskName" "INFO"
} catch {
    Write-InstallerLog "ERRO ao criar Scheduled Task: $($_.Exception.Message)" "ERROR"
    Write-Host "❌ Falha ao criar Scheduled Task." -ForegroundColor Red
    exit 1
}

Write-Host "[4/4] Iniciando agente..." -ForegroundColor Yellow

# Start the agent immediately
try {
    Start-ScheduledTask -TaskName $TaskName
    Write-InstallerLog "Scheduled Task iniciada: $TaskName" "INFO"
    Start-Sleep -Seconds 2
    
    # Verify task is running
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    if ($taskInfo.LastTaskResult -eq 0 -or $taskInfo.LastTaskResult -eq 267009) {
        Write-InstallerLog "Agente iniciado com sucesso." "SUCCESS"
    } else {
        Write-InstallerLog "Aviso: Task iniciada mas com código: $($taskInfo.LastTaskResult)" "WARN"
    }
} catch {
    Write-InstallerLog "ERRO ao iniciar Scheduled Task: $($_.Exception.Message)" "ERROR"
    Write-Host "⚠️  Task criada mas não iniciada. Inicie manualmente ou reinicie o sistema." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Green
Write-Host "✅ Instalação concluída com sucesso!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""
Write-Host "Detalhes:" -ForegroundColor Cyan
Write-Host "  Diretório: $BasePath" -ForegroundColor Gray
Write-Host "  Logs: $LogFile" -ForegroundColor Gray
Write-Host "  Task: $TaskName" -ForegroundColor Gray
Write-Host ""
Write-Host "O agente está em execução em segundo plano." -ForegroundColor Green
Write-Host "Para verificar logs: Get-Content '$LogFile' -Tail 50" -ForegroundColor Gray
Write-Host ""

Write-InstallerLog "Instalação concluída com sucesso." "SUCCESS"
`;

// Linux Installer Template (v3) - systemd service
export const LINUX_INSTALLER_TEMPLATE_V3 = String.raw`#!/usr/bin/env bash
# CyberShield Agent - Linux Installation Script v3.0
# Auto-generated: {{TIMESTAMP}}

set -euo pipefail

echo "=========================================="
echo "CyberShield Agent Installer v3.0 (Linux)"
echo "=========================================="
echo ""

# Configuration
SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

# Paths
INSTALL_DIR="/opt/cybershield"
AGENT_SCRIPT="$INSTALL_DIR/cybershield-agent.sh"
LOG_DIR="/var/log/cybershield"
SYSTEMD_SERVICE="/etc/systemd/system/cybershield-agent.service"

# Verify root
if [[ $EUID -ne 0 ]]; then
   echo "❌ Este script deve ser executado como root (use sudo)" 
   exit 1
fi

echo "[1/5] Verificando dependências..."
for cmd in curl bash openssl jq; do
    if ! command -v $cmd &> /dev/null; then
        echo "❌ Comando '$cmd' não encontrado. Por favor, instale-o primeiro."
        exit 1
    fi
done

echo "[2/5] Criando diretórios..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

echo "[3/5] Baixando script do agente..."
if ! curl -fsSL "$AGENT_SCRIPT_URL" -o "$AGENT_SCRIPT"; then
    echo "❌ Falha ao baixar script do agente"
    exit 1
fi

chmod +x "$AGENT_SCRIPT"

echo "[4/5] Criando serviço systemd..."
cat > "$SYSTEMD_SERVICE" <<EOF
[Unit]
Description=CyberShield Security Agent v3.0
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$AGENT_SCRIPT
Environment="SERVER_URL=$SERVER_URL"
Environment="AGENT_TOKEN=$AGENT_TOKEN"
Environment="HMAC_SECRET=$HMAC_SECRET"
Environment="AGENT_NAME=$AGENT_NAME"
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/agent.log
StandardError=append:$LOG_DIR/agent.log

[Install]
WantedBy=multi-user.target
EOF

echo "[5/5] Iniciando serviço..."
systemctl daemon-reload
systemctl enable cybershield-agent
systemctl start cybershield-agent

sleep 2

if systemctl is-active --quiet cybershield-agent; then
    echo ""
    echo "=========================================="
    echo "✅ Instalação concluída com sucesso!"
    echo "=========================================="
    echo ""
    echo "Status: $(systemctl is-active cybershield-agent)"
    echo "Logs: journalctl -u cybershield-agent -f"
    echo ""
else
    echo "⚠️  Serviço instalado mas não está ativo."
    echo "Verifique logs: journalctl -u cybershield-agent -xe"
    exit 1
fi
`;

// macOS Installer Template (v3) - LaunchDaemon
export const MACOS_INSTALLER_TEMPLATE_V3 = String.raw`#!/usr/bin/env bash
# CyberShield Agent - macOS Installation Script v3.0
# Auto-generated: {{TIMESTAMP}}

set -euo pipefail

echo "=========================================="
echo "CyberShield Agent Installer v3.0 (macOS)"
echo "=========================================="
echo ""

# Configuration
SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"
AGENT_VERSION="{{AGENT_VERSION}}"
AGENT_SCRIPT_URL="{{AGENT_SCRIPT_URL}}"

# Paths
INSTALL_DIR="/usr/local/cybershield"
AGENT_SCRIPT="$INSTALL_DIR/cybershield-agent.sh"
LOG_DIR="/var/log/cybershield"
PLIST_PATH="/Library/LaunchDaemons/com.cybershield.agent.plist"

# Verify root
if [[ $EUID -ne 0 ]]; then
   echo "❌ Este script deve ser executado como root (use sudo)" 
   exit 1
fi

echo "[1/5] Verificando dependências..."
for cmd in curl bash; do
    if ! command -v $cmd &> /dev/null; then
        echo "❌ Comando '$cmd' não encontrado."
        exit 1
    fi
done

echo "[2/5] Criando diretórios..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

echo "[3/5] Baixando script do agente..."
if ! curl -fsSL "$AGENT_SCRIPT_URL" -o "$AGENT_SCRIPT"; then
    echo "❌ Falha ao baixar script do agente"
    exit 1
fi

chmod +x "$AGENT_SCRIPT"

echo "[4/5] Criando LaunchDaemon..."
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$AGENT_SCRIPT</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SERVER_URL</key>
        <string>$SERVER_URL</string>
        <key>AGENT_TOKEN</key>
        <string>$AGENT_TOKEN</string>
        <key>HMAC_SECRET</key>
        <string>$HMAC_SECRET</string>
        <key>AGENT_NAME</key>
        <string>$AGENT_NAME</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/agent.log</string>
</dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"

echo "[5/5] Iniciando agente..."
launchctl load "$PLIST_PATH"

sleep 2

if launchctl list | grep -q com.cybershield.agent; then
    echo ""
    echo "=========================================="
    echo "✅ Instalação concluída com sucesso!"
    echo "=========================================="
    echo ""
    echo "Logs: tail -f $LOG_DIR/agent.log"
    echo ""
else
    echo "⚠️  LaunchDaemon carregado mas não está ativo."
    echo "Verifique logs: tail -f $LOG_DIR/agent.log"
    exit 1
fi
`;

