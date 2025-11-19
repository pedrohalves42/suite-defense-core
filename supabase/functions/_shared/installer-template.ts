/**
 * Single Source of Truth for Installers
 * 
 * This file is the ONLY authoritative template for Windows/Linux/macOS installers.
 * Last synchronized: 2025-01-19 (v3.1.0-FIXED)
 */

// Windows Installer Template
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

Write-InstallerLog "Iniciando instalação do CyberShield Agent" "INFO"
Write-InstallerLog "ServerUrl: $ServerUrl" "INFO"
Write-InstallerLog "AgentName: $AgentName" "INFO"

# Agent Script Content placeholder
$AgentScriptContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

$AgentScriptPath = Join-Path $BasePath "cybershield-agent-$AgentName.ps1"
$AgentScriptContent | Out-File -FilePath $AgentScriptPath -Encoding UTF8 -Force

Write-InstallerLog "Script do agente criado: $AgentScriptPath" "INFO"

# Scheduled Task
$TaskName = "CyberShieldAgent-$AgentName"
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$AgentScriptPath\`" -ServerUrl \`"$ServerUrl\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -AgentName \`"$AgentName\`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null

Write-InstallerLog "Scheduled Task criada: $TaskName" "SUCCESS"

Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Instalação concluída com sucesso!" -ForegroundColor Green
Write-InstallerLog "Instalação concluída com sucesso." "SUCCESS"
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

# Enable and start service
systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

echo "Installation complete!"
`;

// Linux Installer Template (v3) - EnvVars Mode
export const LINUX_INSTALLER_TEMPLATE_V3_ENVVARS = String.raw`#!/usr/bin/env bash
# CyberShield Agent - Linux Installation Script v3.0 (EnvVars Mode)

set -euo pipefail

echo "Installing CyberShield Agent (EnvVars Mode)"

# Create directory
INSTALL_DIR="/opt/cybershield"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
chmod +x cybershield-agent.sh

# Create env file with credentials
cat > "$INSTALL_DIR/.env" <<EOF
SERVER_URL={{SERVER_URL}}
AGENT_TOKEN={{AGENT_TOKEN}}
HMAC_SECRET={{HMAC_SECRET}}
AGENT_NAME={{AGENT_NAME}}
EOF

# Create systemd service that reads from .env
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/cybershield-agent.sh
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

echo "Installation complete!"
`;

// macOS Installer Template (v3)
export const MACOS_INSTALLER_TEMPLATE_V3 = String.raw`#!/usr/bin/env zsh
# CyberShield Agent - macOS Installation Script v3.0

set -euo pipefail

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "Installing CyberShield Agent: $AGENT_NAME"

# Create directory
INSTALL_DIR="/usr/local/cybershield"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
chmod +x cybershield-agent.sh

# Create LaunchDaemon
cat > /Library/LaunchDaemons/com.cybershield.agent.plist <<EOF
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
    <string>$INSTALL_DIR/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/agent-error.log</string>
</dict>
</plist>
EOF

# Load and start service
launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

echo "Installation complete!"
`;

// macOS Installer Template (v3) - EnvVars Mode  
export const MACOS_INSTALLER_TEMPLATE_V3_ENVVARS = MACOS_INSTALLER_TEMPLATE_V3;
