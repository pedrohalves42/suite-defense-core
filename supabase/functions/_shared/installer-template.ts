/**
 * Single Source of Truth for Installers
 * 
 * This file is the ONLY authoritative template for Windows/Linux/macOS installers.
 * Last synchronized: 2025-01-19 (v3.1.0-HARDENED)
 */

// Windows Installer Template (v3.1.0-HARDENED)
export const WINDOWS_INSTALLER_TEMPLATE = `#Requires -RunAsAdministrator
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

# ============= FASE 0: Pre-checks =============
$BasePath  = "C:\\CyberShield"
$LogsPath  = Join-Path $BasePath "logs"
$LogFile   = Join-Path $LogsPath "installer.log"

New-Item -ItemType Directory -Path $BasePath -Force  | Out-Null
New-Item -ItemType Directory -Path $LogsPath -Force  | Out-Null

function Write-InstallerLog {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    $line | Out-File -FilePath $LogFile -Append -Encoding UTF8
    Write-Host $line
}

Write-InstallerLog "=== CyberShield Agent Installer v3.1.0-HARDENED ===" "INFO"
Write-InstallerLog "ServerUrl: $ServerUrl" "INFO"
Write-InstallerLog "AgentName: $AgentName" "INFO"

# ============= FASE 1: Cleanup =============
Write-InstallerLog "FASE 1: Limpando instalações anteriores..." "INFO"

# Stop old processes
try {
    Get-Process -Name "*cybershield*" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-InstallerLog "Parando processo: $($_.Name) (PID: $($_.Id))" "INFO"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
} catch {
    Write-InstallerLog "Aviso ao parar processos: $($_.Exception.Message)" "WARN"
}

# Remove old scheduled tasks
try {
    Get-ScheduledTask -TaskName "CyberShieldAgent*" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-InstallerLog "Removendo task antiga: $($_.TaskName)" "INFO"
        Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:\$false -ErrorAction SilentlyContinue
    }
} catch {
    Write-InstallerLog "Aviso ao remover tasks: $($_.Exception.Message)" "WARN"
}

Write-InstallerLog "FASE 1: Cleanup concluído" "SUCCESS"

# ============= FASE 2: Instalação =============
Write-InstallerLog "FASE 2: Criando script do agente..." "INFO"

$AgentScriptContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

$AgentScriptPath = Join-Path $BasePath "cybershield-agent-$AgentName.ps1"
$AgentScriptContent | Out-File -FilePath $AgentScriptPath -Encoding UTF8 -Force

Write-InstallerLog "Script criado: $AgentScriptPath ($(([System.IO.FileInfo]$AgentScriptPath).Length) bytes)" "SUCCESS"

# ============= FASE 3: Self-test =============
Write-InstallerLog "FASE 3: Testando conectividade com backend..." "INFO"

try {
    $healthUrl = "$ServerUrl/functions/v1/health"
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-InstallerLog "Health check OK: $($response.StatusCode)" "SUCCESS"
} catch {
    Write-InstallerLog "AVISO: Health check falhou: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Continuando instalação (agente tentará conectar depois)..." "INFO"
}

Write-InstallerLog "FASE 3: Self-test concluído" "SUCCESS"

# ============= FASE 4: Scheduled Task =============
Write-InstallerLog "FASE 4: Criando Scheduled Task..." "INFO"

$TaskName = "CyberShieldAgent-$AgentName"
$Action = New-ScheduledTaskAction \`
    -Execute "powershell.exe" \`
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \\\`"$AgentScriptPath\\\`" -ServerUrl \\\`"$ServerUrl\\\`" -AgentToken \\\`"$AgentToken\\\`" -HmacSecret \\\`"$HmacSecret\\\`" -AgentName \\\`"$AgentName\\\`""

$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet \`
    -AllowStartIfOnBatteries \`
    -DontStopIfGoingOnBatteries \`
    -StartWhenAvailable \`
    -RestartInterval (New-TimeSpan -Minutes 1) \`
    -RestartCount 3

Register-ScheduledTask \`
    -TaskName $TaskName \`
    -Action $Action \`
    -Trigger $Trigger \`
    -Principal $Principal \`
    -Settings $Settings \`
    -Force | Out-Null

Write-InstallerLog "Scheduled Task criada: $TaskName" "SUCCESS"

# ============= FASE 5: Inicialização =============
Write-InstallerLog "FASE 5: Iniciando agente..." "INFO"

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

$taskInfo = Get-ScheduledTask -TaskName $TaskName
Write-InstallerLog "Status da task: $($taskInfo.State)" "INFO"

Write-InstallerLog "FASE 5: Agente iniciado" "SUCCESS"

# ============= FASE 6: Telemetria =============
Write-InstallerLog "FASE 6: Enviando telemetria de instalação..." "INFO"

try {
    $telemetryUrl = "$ServerUrl/functions/v1/track-installation-event"
    $telemetryBody = @{
        agent_name = $AgentName
        event_type = "post_installation"
        platform = "windows"
        success = $true
        metadata = @{
            installer_version = "3.1.0-HARDENED"
            powershell_version = $PSVersionTable.PSVersion.ToString()
            os_version = [System.Environment]::OSVersion.Version.ToString()
        }
    } | ConvertTo-Json -Depth 5
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    Invoke-WebRequest \`
        -Uri $telemetryUrl \`
        -Method POST \`
        -Body $telemetryBody \`
        -Headers $headers \`
        -UseBasicParsing \`
        -TimeoutSec 10 \`
        -ErrorAction Stop | Out-Null
    
    Write-InstallerLog "Telemetria enviada com sucesso" "SUCCESS"
} catch {
    Write-InstallerLog "AVISO: Falha ao enviar telemetria: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Instalação concluída, mas telemetria não foi enviada" "INFO"
}

# ============= Conclusão =============
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "✅ Instalação concluída com sucesso!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Detalhes da instalação:" -ForegroundColor Cyan
Write-Host "  • Agente: $AgentName" -ForegroundColor White
Write-Host "  • Pasta: $BasePath" -ForegroundColor White
Write-Host "  • Logs: $LogFile" -ForegroundColor White
Write-Host "  • Task: $TaskName" -ForegroundColor White
Write-Host ""
Write-Host "O agente está rodando em background e enviará heartbeats automaticamente." -ForegroundColor White
Write-Host "Verifique o status no dashboard em alguns minutos." -ForegroundColor White
Write-Host ""

Write-InstallerLog "=== Instalação concluída com sucesso ===" "SUCCESS"
`;

// Linux Installer Template (v3)
export const LINUX_INSTALLER_TEMPLATE_V3 = String.raw`#!/usr/bin/env bash
# CyberShield Agent - Linux Installation Script v3.0

set -euo pipefail

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "Installing CyberShield Agent: $AGENT_NAME"

# Create directory
INSTALL_DIR="/opt/cybershield"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
chmod +x cybershield-agent.sh

# Create systemd service
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/cybershield-agent.sh
Environment="SERVER_URL=$SERVER_URL"
Environment="AGENT_TOKEN=$AGENT_TOKEN"
Environment="HMAC_SECRET=$HMAC_SECRET"
Environment="AGENT_NAME=$AGENT_NAME"
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

echo "✅ CyberShield Agent installed successfully!"
`;

// macOS Installer Template (v3)
export const MACOS_INSTALLER_TEMPLATE_V3 = String.raw`#!/bin/zsh
# CyberShield Agent - macOS Installation Script v3.0

set -euo pipefail

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "Installing CyberShield Agent: $AGENT_NAME"

# Create directory
INSTALL_DIR="/usr/local/cybershield"
sudo mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
sudo curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
sudo chmod +x cybershield-agent.sh

# Create LaunchDaemon
sudo tee /Library/LaunchDaemons/com.cybershield.agent.plist > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/cybershield-agent.sh</string>
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
    <string>/var/log/cybershield-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/cybershield-agent.error.log</string>
</dict>
</plist>
EOF

# Load service
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

echo "✅ CyberShield Agent installed successfully!"
`;
