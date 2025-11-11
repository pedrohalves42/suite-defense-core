#!/bin/bash
# CyberShield Agent - Linux Installation Script
# Auto-generated: {{TIMESTAMP}}
# Version: 2.1.0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}==================================${NC}"
echo -e "${CYAN}CyberShield Agent Installer v2.1.0${NC}"
echo -e "${CYAN}==================================${NC}"
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}ERROR: This script must be run as root${NC}"
    echo -e "${YELLOW}Please run: sudo $0${NC}"
    exit 1
fi

# Configuration
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
SERVER_URL="{{SERVER_URL}}"
POLL_INTERVAL=60

# Installation paths
INSTALL_DIR="/opt/cybershield"
LOG_DIR="/var/log/cybershield"
AGENT_SCRIPT="${INSTALL_DIR}/cybershield-agent.sh"
SERVICE_NAME="cybershield-agent"

echo -e "${GREEN}[1/6] Creating installation directories...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

echo -e "${GREEN}[2/6] Installing agent script...${NC}"

# Agent script content (embedded)
cat > "$AGENT_SCRIPT" << 'AGENT_SCRIPT_EOF'
{{AGENT_SCRIPT_CONTENT}}
AGENT_SCRIPT_EOF

chmod +x "$AGENT_SCRIPT"

echo -e "${GREEN}[3/6] Testing server connectivity...${NC}"
if curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/functions/v1/heartbeat" | grep -q "405\|401\|200"; then
    echo -e "${GREEN}✓ Server is reachable${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Could not reach server at ${SERVER_URL}${NC}"
    echo -e "${YELLOW}The agent will retry automatically once installed${NC}"
fi

echo -e "${GREEN}[4/6] Checking dependencies...${NC}"
MISSING_DEPS=""
for cmd in curl jq openssl; do
    if ! command -v $cmd &> /dev/null; then
        MISSING_DEPS="$MISSING_DEPS $cmd"
    fi
done

if [ -n "$MISSING_DEPS" ]; then
    echo -e "${YELLOW}Installing missing dependencies:$MISSING_DEPS${NC}"
    if command -v apt-get &> /dev/null; then
        apt-get update -qq
        apt-get install -y -qq $MISSING_DEPS
    elif command -v yum &> /dev/null; then
        yum install -y -q $MISSING_DEPS
    else
        echo -e "${RED}ERROR: Could not install dependencies${NC}"
        echo -e "${YELLOW}Please install manually:$MISSING_DEPS${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}[5/6] Creating systemd service...${NC}"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${AGENT_SCRIPT} "${AGENT_TOKEN}" "${HMAC_SECRET}" "${SERVER_URL}" ${POLL_INTERVAL}
Restart=always
RestartSec=10
StandardOutput=append:${LOG_DIR}/agent.log
StandardError=append:${LOG_DIR}/agent-error.log
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}

echo -e "${GREEN}[6/6] Starting agent...${NC}"
systemctl start ${SERVICE_NAME}

# Wait for service to start
sleep 2

# Check service status
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo ""
    echo -e "${GREEN}==================================${NC}"
    echo -e "${GREEN}✓ Installation completed successfully!${NC}"
    echo -e "${GREEN}==================================${NC}"
    echo ""
    echo -e "${GREEN}Agent Status: RUNNING${NC}"
    echo -e "${CYAN}Installation Directory: ${INSTALL_DIR}${NC}"
    echo -e "${CYAN}Log Directory: ${LOG_DIR}${NC}"
    echo ""
    echo -e "${NC}The agent is now:${NC}"
    echo -e "  • Monitoring this system"
    echo -e "  • Sending heartbeats every 60 seconds"
    echo -e "  • Reporting metrics every 5 minutes"
    echo -e "  • Polling for jobs"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo -e "  View logs:    ${CYAN}tail -f ${LOG_DIR}/agent.log${NC}"
    echo -e "  Check status: ${CYAN}systemctl status ${SERVICE_NAME}${NC}"
    echo -e "  Stop agent:   ${CYAN}systemctl stop ${SERVICE_NAME}${NC}"
    echo -e "  Start agent:  ${CYAN}systemctl start ${SERVICE_NAME}${NC}"
    echo ""
else
    echo ""
    echo -e "${YELLOW}WARNING: Agent installed but not running${NC}"
    echo ""
    echo -e "${YELLOW}Check logs:${NC} journalctl -u ${SERVICE_NAME} -n 50"
    echo -e "${YELLOW}Start manually:${NC} systemctl start ${SERVICE_NAME}"
    echo ""
fi
