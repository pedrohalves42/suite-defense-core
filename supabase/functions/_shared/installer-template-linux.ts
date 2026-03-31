/** Linux Installer Templates - Split from installer-template.ts */
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

echo "[OK]  CyberShield Agent installed successfully!"
`;

export const LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED = String.raw`#!/usr/bin/env bash
# CyberShield Agent - Linux Installation Script v3.1 (Embedded)
# Version: {{INSTALLER_VERSION}}
# Generated: {{TIMESTAMP}}

set -euo pipefail

echo "=========================================="
echo " CyberShield Agent Linux Installer"
echo " Version: {{INSTALLER_VERSION}}"
echo "=========================================="

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "[INFO] Agent Name: $AGENT_NAME"
echo "[INFO] Server: $SERVER_URL"

# Create directories
INSTALL_DIR="/opt/cybershield"
LOG_DIR="/var/log/cybershield"

echo "[INFO] Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

# Write embedded agent script
echo "[INFO] Installing agent script..."
cat > "$INSTALL_DIR/cybershield-agent.sh" << 'CYBERSHIELD_AGENT_SCRIPT_END'
{{AGENT_SCRIPT_CONTENT}}
CYBERSHIELD_AGENT_SCRIPT_END

chmod +x "$INSTALL_DIR/cybershield-agent.sh"
SCRIPT_SIZE=$(stat -c%s "$INSTALL_DIR/cybershield-agent.sh" 2>/dev/null || stat -f%z "$INSTALL_DIR/cybershield-agent.sh" 2>/dev/null || echo "0")
echo "[OK] Agent script created: $SCRIPT_SIZE bytes"

# Validate script size
if [[ "$SCRIPT_SIZE" -lt 10000 ]]; then
    echo "[ERROR] Agent script too small ($SCRIPT_SIZE bytes). Installation may be corrupted."
    exit 1
fi

# Create environment file
echo "[INFO] Creating environment file..."
cat > "$INSTALL_DIR/cybershield-agent.env" <<EOF
SERVER_URL=$SERVER_URL
AGENT_TOKEN=$AGENT_TOKEN
HMAC_SECRET=$HMAC_SECRET
AGENT_NAME=$AGENT_NAME
EOF
chmod 600 "$INSTALL_DIR/cybershield-agent.env"
echo "[OK] Environment file created"

# Check dependencies
echo "[INFO] Verificando dependencias..."
check_install_dep() {
  local cmd="$1"
  local pkg="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[INFO] Instalando $pkg..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq "$pkg" || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y "$pkg" || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y "$pkg" || true
    fi
  else
    echo "[OK] $cmd disponivel"
  fi
}

check_install_dep "jq" "jq"
check_install_dep "curl" "curl"
check_install_dep "openssl" "openssl"
check_install_dep "sqlite3" "sqlite3"
echo "[OK] Dependencias verificadas"

# Create systemd service (permissive for security scans)
echo "[INFO] Creating systemd service..."
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash $INSTALL_DIR/cybershield-agent.sh
EnvironmentFile=$INSTALL_DIR/cybershield-agent.env
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Start service
echo "[INFO] Starting agent service..."
systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

# Verify service started
sleep 2
if systemctl is-active --quiet cybershield-agent.service; then
    echo "[OK] CyberShield Agent service is running"
else
    echo "[WARN] Service may not have started correctly. Check: journalctl -u cybershield-agent.service"
fi

# Send post_installation telemetry
echo "[INFO] Sending installation telemetry..."
TELEMETRY_BODY=$(cat <<TELEMETRY_EOF
{
  "agent_name": "$AGENT_NAME",
  "event_type": "post_installation",
  "platform": "linux",
  "installation_method": "one_click",
  "success": true,
  "agent_version": "{{INSTALLER_VERSION}}",
  "metadata": {
    "installer_version": "{{INSTALLER_VERSION}}",
    "script_size_bytes": $SCRIPT_SIZE
  }
}
TELEMETRY_EOF
)

# Calculate HMAC signature
TIMESTAMP=$(($(date +%s) * 1000))
NONCE=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "nonce-$(date +%s)")
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
echo "  Status:  sudo systemctl status cybershield-agent"
echo "  Logs:    sudo journalctl -u cybershield-agent -f"
echo "  Stop:    sudo systemctl stop cybershield-agent"
echo "  Restart: sudo systemctl restart cybershield-agent"
echo ""
`;
