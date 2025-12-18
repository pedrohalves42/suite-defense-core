#!/bin/bash
# ============================================================================
# CyberShield Agent Migration Script v3→v4
# For Linux and macOS systems
# Version: v4.0.0-STATE-MACHINE
# ============================================================================

set -euo pipefail

# Configuration (will be replaced by installer)
SERVER_URL="${CYBERSHIELD_SERVER_URL:-}"
AGENT_TOKEN="${CYBERSHIELD_AGENT_TOKEN:-}"
HMAC_SECRET="${CYBERSHIELD_HMAC_SECRET:-}"
AGENT_NAME="${CYBERSHIELD_AGENT_NAME:-}"

# Paths
INSTALL_DIR="/opt/cybershield"
V3_CONFIG="$INSTALL_DIR/config.json"
V3_ENV="/etc/cybershield-agent.env"
BACKUP_DIR="$INSTALL_DIR/backup-v3-$(date +%Y%m%d_%H%M%S)"
LOG_FILE="/var/log/cybershield-migration.log"
OS_TYPE="$(uname -s | tr '[:upper:]' '[:lower:]')"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"; }

# Pre-flight checks
preflight_check() {
    log_info "Running pre-flight checks..."
    
    # Check root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
    
    # Check v3 installation exists
    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_error "CyberShield v3 installation not found at $INSTALL_DIR"
        exit 1
    fi
    
    # Check disk space (minimum 100MB)
    local available_space
    available_space=$(df -m "$INSTALL_DIR" | awk 'NR==2 {print $4}')
    if [[ "$available_space" -lt 100 ]]; then
        log_error "Insufficient disk space. Need at least 100MB, have ${available_space}MB"
        exit 1
    fi
    
    # Check network connectivity
    if ! curl -s --max-time 10 "https://google.com" > /dev/null 2>&1; then
        log_error "No network connectivity"
        exit 1
    fi
    
    # Detect credentials from v3
    if [[ -f "$V3_CONFIG" ]]; then
        log_info "Found v3 config.json"
        if command -v jq &> /dev/null; then
            AGENT_TOKEN="${AGENT_TOKEN:-$(jq -r '.token // empty' "$V3_CONFIG" 2>/dev/null)}"
            HMAC_SECRET="${HMAC_SECRET:-$(jq -r '.hmac_secret // empty' "$V3_CONFIG" 2>/dev/null)}"
            AGENT_NAME="${AGENT_NAME:-$(jq -r '.agent_name // empty' "$V3_CONFIG" 2>/dev/null)}"
            SERVER_URL="${SERVER_URL:-$(jq -r '.server_url // empty' "$V3_CONFIG" 2>/dev/null)}"
        else
            log_warn "jq not installed, trying python3"
            AGENT_TOKEN="${AGENT_TOKEN:-$(python3 -c "import json; print(json.load(open('$V3_CONFIG')).get('token',''))" 2>/dev/null || echo "")}"
            HMAC_SECRET="${HMAC_SECRET:-$(python3 -c "import json; print(json.load(open('$V3_CONFIG')).get('hmac_secret',''))" 2>/dev/null || echo "")}"
            AGENT_NAME="${AGENT_NAME:-$(python3 -c "import json; print(json.load(open('$V3_CONFIG')).get('agent_name',''))" 2>/dev/null || echo "")}"
            SERVER_URL="${SERVER_URL:-$(python3 -c "import json; print(json.load(open('$V3_CONFIG')).get('server_url',''))" 2>/dev/null || echo "")}"
        fi
    fi
    
    # Check env file
    if [[ -f "$V3_ENV" ]]; then
        log_info "Found v3 env file"
        source "$V3_ENV" 2>/dev/null || true
        AGENT_TOKEN="${AGENT_TOKEN:-${CS_AGENT_TOKEN:-}}"
        HMAC_SECRET="${HMAC_SECRET:-${CS_HMAC_SECRET:-}}"
        AGENT_NAME="${AGENT_NAME:-${CS_AGENT_NAME:-}}"
        SERVER_URL="${SERVER_URL:-${CS_SERVER_URL:-}}"
    fi
    
    # Validate credentials
    if [[ -z "$AGENT_TOKEN" ]] || [[ -z "$HMAC_SECRET" ]] || [[ -z "$SERVER_URL" ]]; then
        log_error "Missing required credentials. Please provide SERVER_URL, AGENT_TOKEN, and HMAC_SECRET"
        exit 1
    fi
    
    log_success "Pre-flight checks passed"
}

# Backup v3 installation
backup_v3() {
    log_info "Creating backup of v3 installation..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup configuration
    [[ -f "$V3_CONFIG" ]] && cp "$V3_CONFIG" "$BACKUP_DIR/"
    [[ -f "$V3_ENV" ]] && cp "$V3_ENV" "$BACKUP_DIR/"
    
    # Backup agent script
    for script in "$INSTALL_DIR"/cybershield-agent*.sh; do
        [[ -f "$script" ]] && cp "$script" "$BACKUP_DIR/"
    done
    
    # Backup blocked websites
    [[ -f "$INSTALL_DIR/blocked_websites.json" ]] && cp "$INSTALL_DIR/blocked_websites.json" "$BACKUP_DIR/"
    
    # Backup logs (last 1MB only)
    if [[ -f "/var/log/cybershield-agent.log" ]]; then
        tail -c 1048576 /var/log/cybershield-agent.log > "$BACKUP_DIR/agent.log.tail"
    fi
    
    # Create manifest
    cat > "$BACKUP_DIR/manifest.json" <<EOF
{
    "backup_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "v3_version": "$(grep -oP 'AGENT_VERSION="\K[^"]+' "$INSTALL_DIR"/cybershield-agent*.sh 2>/dev/null | head -1 || echo 'unknown')",
    "os_type": "$OS_TYPE",
    "hostname": "$(hostname)"
}
EOF
    
    log_success "Backup created at $BACKUP_DIR"
}

# Stop v3 agent
stop_v3_agent() {
    log_info "Stopping v3 agent..."
    
    if [[ "$OS_TYPE" == "darwin" ]]; then
        # macOS - stop LaunchDaemon
        local plist="/Library/LaunchDaemons/com.cybershield.agent.plist"
        if [[ -f "$plist" ]]; then
            launchctl unload "$plist" 2>/dev/null || true
            launchctl bootout system "$plist" 2>/dev/null || true
        fi
    else
        # Linux - stop systemd service
        systemctl stop cybershield-agent.service 2>/dev/null || true
        systemctl disable cybershield-agent.service 2>/dev/null || true
    fi
    
    # Kill any remaining processes
    pkill -f "cybershield-agent" 2>/dev/null || true
    sleep 2
    
    log_success "v3 agent stopped"
}

# Download v4 agent
download_v4_agent() {
    log_info "Downloading v4 agent..."
    
    local script_name
    if [[ "$OS_TYPE" == "darwin" ]]; then
        script_name="cybershield-agent-macos-v4.sh"
    else
        script_name="cybershield-agent-linux-v4.sh"
    fi
    
    local download_url="$SERVER_URL/agent-scripts/$script_name"
    local temp_script="/tmp/$script_name"
    
    # Download script
    if ! curl -fsSL --max-time 60 -o "$temp_script" "$download_url"; then
        log_error "Failed to download v4 agent from $download_url"
        return 1
    fi
    
    # Validate script (basic check)
    if [[ ! -s "$temp_script" ]]; then
        log_error "Downloaded script is empty"
        return 1
    fi
    
    if ! head -1 "$temp_script" | grep -q "^#!/"; then
        log_error "Downloaded script is not a valid shell script"
        return 1
    fi
    
    # Move to install directory
    mv "$temp_script" "$INSTALL_DIR/cybershield-agent-v4.sh"
    chmod +x "$INSTALL_DIR/cybershield-agent-v4.sh"
    
    log_success "v4 agent downloaded"
}

# Initialize v4 directory structure
init_v4_structure() {
    log_info "Initializing v4 directory structure..."
    
    # Create v4 directories
    mkdir -p "$INSTALL_DIR/logs"
    mkdir -p "$INSTALL_DIR/evidence"
    mkdir -p "$INSTALL_DIR/dns-filter"
    mkdir -p "$INSTALL_DIR/policies"
    mkdir -p "$INSTALL_DIR/temp"
    
    # Set permissions
    chmod 700 "$INSTALL_DIR/evidence"
    chmod 700 "$INSTALL_DIR/policies"
    
    log_success "v4 directory structure created"
}

# Migrate configuration
migrate_configuration() {
    log_info "Migrating configuration to v4 format..."
    
    # Create v4 state file
    cat > "$INSTALL_DIR/agent-state.json" <<EOF
{
    "current_state": "RUNNING",
    "previous_state": "INITIALIZING",
    "state_changed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "consecutive_failures": 0,
    "migrated_from_v3": true,
    "migration_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "v3_backup_path": "$BACKUP_DIR"
}
EOF
    
    # Create v4 config
    cat > "$INSTALL_DIR/config.json" <<EOF
{
    "server_url": "$SERVER_URL",
    "agent_name": "$AGENT_NAME",
    "token": "$AGENT_TOKEN",
    "hmac_secret": "$HMAC_SECRET",
    "version": "v4.0.0-STATE-MACHINE",
    "migrated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    # Copy blocked websites if exists
    if [[ -f "$BACKUP_DIR/blocked_websites.json" ]]; then
        cp "$BACKUP_DIR/blocked_websites.json" "$INSTALL_DIR/blocked_websites.json"
    fi
    
    # Create env file for v4
    cat > "/etc/cybershield-agent.env" <<EOF
# CyberShield Agent v4.0 Configuration
CS_SERVER_URL="$SERVER_URL"
CS_AGENT_TOKEN="$AGENT_TOKEN"
CS_HMAC_SECRET="$HMAC_SECRET"
CS_AGENT_NAME="$AGENT_NAME"
CS_VERSION="v4.0.0-STATE-MACHINE"
EOF
    
    chmod 600 "/etc/cybershield-agent.env"
    
    log_success "Configuration migrated"
}

# Setup v4 service
setup_v4_service() {
    log_info "Setting up v4 service..."
    
    if [[ "$OS_TYPE" == "darwin" ]]; then
        # macOS LaunchDaemon
        local plist="/Library/LaunchDaemons/com.cybershield.agent.plist"
        cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$INSTALL_DIR/cybershield-agent-v4.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/cybershield-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/cybershield-agent-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CS_SERVER_URL</key>
        <string>$SERVER_URL</string>
        <key>CS_AGENT_TOKEN</key>
        <string>$AGENT_TOKEN</string>
        <key>CS_HMAC_SECRET</key>
        <string>$HMAC_SECRET</string>
        <key>CS_AGENT_NAME</key>
        <string>$AGENT_NAME</string>
    </dict>
</dict>
</plist>
EOF
        
        # Load service
        launchctl load -w "$plist"
        
    else
        # Linux systemd
        cat > "/etc/systemd/system/cybershield-agent.service" <<EOF
[Unit]
Description=CyberShield Security Agent v4.0
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash $INSTALL_DIR/cybershield-agent-v4.sh
Restart=always
RestartSec=30
EnvironmentFile=/etc/cybershield-agent.env
StandardOutput=append:/var/log/cybershield-agent.log
StandardError=append:/var/log/cybershield-agent-error.log

[Install]
WantedBy=multi-user.target
EOF
        
        # Reload and start
        systemctl daemon-reload
        systemctl enable cybershield-agent.service
        systemctl start cybershield-agent.service
    fi
    
    log_success "v4 service configured and started"
}

# Report migration status
report_migration() {
    log_info "Reporting migration status to server..."
    
    local timestamp
    timestamp=$(date +%s)
    
    local payload
    payload=$(cat <<EOF
{
    "event_type": "migration_completed",
    "agent_name": "$AGENT_NAME",
    "hostname": "$(hostname)",
    "os_type": "$OS_TYPE",
    "from_version": "v3.x",
    "to_version": "v4.0.0-STATE-MACHINE",
    "migration_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "backup_path": "$BACKUP_DIR"
}
EOF
)
    
    # Calculate HMAC
    local hmac_signature
    hmac_signature=$(echo -n "${timestamp}${payload}" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $2}')
    
    # Send report
    curl -s --max-time 30 \
        -X POST "$SERVER_URL/functions/v1/track-installation-event" \
        -H "Content-Type: application/json" \
        -H "X-Agent-Token: $AGENT_TOKEN" \
        -H "X-Timestamp: $timestamp" \
        -H "X-HMAC-SHA256: $hmac_signature" \
        -d "$payload" > /dev/null 2>&1 || true
    
    log_success "Migration status reported"
}

# Rollback function
rollback() {
    log_error "Migration failed, rolling back..."
    
    # Stop v4 if running
    if [[ "$OS_TYPE" == "darwin" ]]; then
        launchctl unload /Library/LaunchDaemons/com.cybershield.agent.plist 2>/dev/null || true
    else
        systemctl stop cybershield-agent.service 2>/dev/null || true
    fi
    
    # Restore v3 files
    if [[ -d "$BACKUP_DIR" ]]; then
        [[ -f "$BACKUP_DIR/config.json" ]] && cp "$BACKUP_DIR/config.json" "$INSTALL_DIR/"
        [[ -f "$BACKUP_DIR/cybershield-agent.env" ]] && cp "$BACKUP_DIR/cybershield-agent.env" "/etc/"
        
        for script in "$BACKUP_DIR"/cybershield-agent*.sh; do
            [[ -f "$script" ]] && cp "$script" "$INSTALL_DIR/"
        done
        
        # Restart v3 service
        if [[ "$OS_TYPE" == "darwin" ]]; then
            local plist="/Library/LaunchDaemons/com.cybershield.agent.plist"
            [[ -f "$plist" ]] && launchctl load -w "$plist"
        else
            systemctl start cybershield-agent.service 2>/dev/null || true
        fi
    fi
    
    log_error "Rollback completed. v3 agent should be running."
    exit 1
}

# Verify migration
verify_migration() {
    log_info "Verifying migration..."
    
    sleep 5  # Wait for service to stabilize
    
    # Check service is running
    if [[ "$OS_TYPE" == "darwin" ]]; then
        if ! launchctl list | grep -q "com.cybershield.agent"; then
            log_error "v4 service is not running"
            return 1
        fi
    else
        if ! systemctl is-active --quiet cybershield-agent.service; then
            log_error "v4 service is not running"
            return 1
        fi
    fi
    
    # Check state file exists
    if [[ ! -f "$INSTALL_DIR/agent-state.json" ]]; then
        log_error "State file not created"
        return 1
    fi
    
    # Check v4 script exists
    if [[ ! -f "$INSTALL_DIR/cybershield-agent-v4.sh" ]]; then
        log_error "v4 script not found"
        return 1
    fi
    
    log_success "Migration verified successfully"
    return 0
}

# Clean v3 artifacts
cleanup_v3() {
    log_info "Cleaning up v3 artifacts..."
    
    # Remove old v3 scripts (keep backup)
    for script in "$INSTALL_DIR"/cybershield-agent-v3*.sh; do
        [[ -f "$script" ]] && rm -f "$script"
    done
    
    # Remove old env file
    rm -f "$INSTALL_DIR/cybershield-agent.env" 2>/dev/null || true
    
    log_success "v3 artifacts cleaned"
}

# Main migration flow
main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       CyberShield Agent Migration v3 → v4                     ║"
    echo "║       State Machine + Evidence Journal Architecture           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Setup error handling
    trap 'rollback' ERR
    
    # Run migration steps
    preflight_check
    backup_v3
    stop_v3_agent
    download_v4_agent
    init_v4_structure
    migrate_configuration
    setup_v4_service
    
    # Verify
    if verify_migration; then
        cleanup_v3
        report_migration
        
        echo ""
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║  ✅ Migration completed successfully!                          ║"
        echo "║                                                                ║"
        echo "║  v4 Features enabled:                                         ║"
        echo "║  • State Machine with formal transitions                       ║"
        echo "║  • Evidence Journal for compliance                             ║"
        echo "║  • DNS Filter integration                                      ║"
        echo "║  • Auto-recovery with exponential backoff                      ║"
        echo "║                                                                ║"
        echo "║  Backup location: $BACKUP_DIR"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo ""
        
        exit 0
    else
        rollback
    fi
}

# Run main
main "$@"
