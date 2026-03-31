/** macOS Installer Templates - Split from installer-template.ts */
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

echo "[OK]  CyberShield Agent installed successfully!"
`;

export const MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED = String.raw`#!/bin/zsh
# CyberShield Agent - macOS Installation Script v3.1 (Embedded)
# Version: {{INSTALLER_VERSION}}
# Generated: {{TIMESTAMP}}

set -euo pipefail

echo "=========================================="
echo " CyberShield Agent macOS Installer"
echo " Version: {{INSTALLER_VERSION}}"
echo "=========================================="

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "[INFO] Agent Name: $AGENT_NAME"
echo "[INFO] Server: $SERVER_URL"

# Create directories
INSTALL_DIR="/Library/Application Support/CyberShield"
LOG_DIR="/Library/Logs/CyberShield"

echo "[INFO] Creating directories..."
sudo mkdir -p "$INSTALL_DIR"
sudo mkdir -p "$LOG_DIR"

# Write embedded agent script
echo "[INFO] Installing agent script..."
sudo tee "$INSTALL_DIR/cybershield-agent.sh" > /dev/null << 'CYBERSHIELD_AGENT_SCRIPT_END'
{{AGENT_SCRIPT_CONTENT}}
CYBERSHIELD_AGENT_SCRIPT_END

sudo chmod +x "$INSTALL_DIR/cybershield-agent.sh"
SCRIPT_SIZE=$(stat -f%z "$INSTALL_DIR/cybershield-agent.sh" 2>/dev/null || echo "0")
echo "[OK] Agent script created: $SCRIPT_SIZE bytes"

# Validate script size
if [[ "$SCRIPT_SIZE" -lt 10000 ]]; then
    echo "[ERROR] Agent script too small ($SCRIPT_SIZE bytes). Installation may be corrupted."
    exit 1
fi

# Create environment file
echo "[INFO] Creating environment file..."
sudo tee "$INSTALL_DIR/cybershield-agent.env" > /dev/null <<EOF
SERVER_URL=$SERVER_URL
AGENT_TOKEN=$AGENT_TOKEN
HMAC_SECRET=$HMAC_SECRET
AGENT_NAME=$AGENT_NAME
EOF
sudo chmod 600 "$INSTALL_DIR/cybershield-agent.env"
echo "[OK] Environment file created"

# Check dependencies
echo "[INFO] Verificando dependencias..."
check_macos_dep() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "[INFO] $cmd nao encontrado, tentando instalar via Homebrew..."
        if command -v brew >/dev/null 2>&1; then
            brew install "$cmd" 2>/dev/null || echo "[WARN] Falha ao instalar $cmd via Homebrew"
        else
            echo "[WARN] Homebrew nao disponivel. Instale $cmd manualmente se necessario."
        fi
    else
        echo "[OK] $cmd disponivel"
    fi
}

# curl, openssl, sqlite3 geralmente ja existem no macOS
check_macos_dep "jq"
check_macos_dep "curl"
check_macos_dep "openssl"
echo "[OK] Dependencias verificadas"

# Create LaunchDaemon
echo "[INFO] Creating LaunchDaemon..."
sudo tee /Library/LaunchDaemons/com.cybershield.agent.plist > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$INSTALL_DIR/cybershield-agent.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
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
    <string>/Library/Logs/CyberShield/agent.log</string>
    <key>StandardErrorPath</key>
    <string>/Library/Logs/CyberShield/agent.error.log</string>
</dict>
</plist>
EOF

# Load service
echo "[INFO] Loading agent service..."
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

# Verify service started
sleep 2
if sudo launchctl list | grep -q "com.cybershield.agent"; then
    echo "[OK] CyberShield Agent service is running"
else
    echo "[WARN] Service may not have started correctly. Check logs."
fi

# Send post_installation telemetry
echo "[INFO] Sending installation telemetry..."
TELEMETRY_BODY="{\"agent_name\": \"$AGENT_NAME\", \"event_type\": \"post_installation\", \"platform\": \"macos\", \"installation_method\": \"one_click\", \"success\": true, \"agent_version\": \"{{INSTALLER_VERSION}}\", \"metadata\": {\"installer_version\": \"{{INSTALLER_VERSION}}\", \"script_size_bytes\": $SCRIPT_SIZE}}"

# Calculate HMAC signature
TIMESTAMP=$(($(date +%s) * 1000))
NONCE=$(uuidgen 2>/dev/null || echo "nonce-$(date +%s)")
PAYLOAD="$TIMESTAMP:$NONCE:$TELEMETRY_BODY"
SIGNATURE=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$HMAC_SECRET" 2>/dev/null | awk '{print $2}')

curl -s -X POST "$SERVER_URL/functions/v1/track-installation-event" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: $AGENT_TOKEN" \
  -H "X-HMAC-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Nonce: $NONCE" \
  -d "$TELEMETRY_BODY" \
  --max-time 10 >/dev/null 2>&1 && echo "[OK] Installation telemetry sent" || echo "[WARN] Telemetry failed (non-critical)"

echo ""
echo "=========================================="
echo " CyberShield Agent installed successfully!"
echo "=========================================="
echo ""
echo "Useful commands:"
echo "  Status:  sudo launchctl list | grep cybershield"
echo "  Logs:    sudo tail -f /Library/Logs/CyberShield/agent.log"
echo "  Stop:    sudo launchctl unload /Library/LaunchDaemons/com.cybershield.agent.plist"
echo "  Start:   sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist"
echo ""
`;
