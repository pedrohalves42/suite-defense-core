/**
 * CyberShield Agent macOS Script - Inline Content
 * CRITICAL: Keep in sync with public/agent-scripts/cybershield-agent-macos.sh if it exists
 * Version: 1.0.0 - Initial macOS Support
 * 
 * REQUIREMENTS:
 * - macOS 10.15+ (Catalina or later)
 * - Bash 3.2+
 * - openssl (for HMAC-SHA256)
 * - curl (for HTTP requests)
 * - launchd (system service management)
 */

export const AGENT_SCRIPT_MACOS_SH = `#!/bin/bash
# CyberShield Agent - macOS
# Version: 1.0.0
# Compatible with: macOS 10.15+ (Catalina, Big Sur, Monterey, Ventura, Sonoma)

set -euo pipefail

# Parameters (passed by LaunchDaemon)
AGENT_TOKEN="\$1"
HMAC_SECRET="\$2"
SERVER_URL="\$3"
POLL_INTERVAL="\${4:-60}"

# Paths (macOS conventions)
LOG_DIR="/Library/Logs/CyberShield"
LOG_FILE="\${LOG_DIR}/agent.log"
MAX_LOG_SIZE=10485760  # 10MB
MAX_LOG_FILES=7

# Create log directory
mkdir -p "\$LOG_DIR"

# Logging function with rotation
write_log() {
    local level="\$1"
    local message="\$2"
    local timestamp
    timestamp=\$(date "+%Y-%m-%d %H:%M:%S")
    local log_entry="[\${timestamp}] [\${level}] \${message}"
    
    # Log rotation
    if [ -f "\$LOG_FILE" ]; then
        local log_size
        log_size=\$(stat -f%z "\$LOG_FILE" 2>/dev/null || echo 0)
        if [ "\$log_size" -gt "\$MAX_LOG_SIZE" ]; then
            for i in \$(seq \$MAX_LOG_FILES -1 1); do
                [ -f "\${LOG_FILE}.\$i" ] && mv "\${LOG_FILE}.\$i" "\${LOG_FILE}.\$((i+1))"
            done
            mv "\$LOG_FILE" "\${LOG_FILE}.1"
        fi
    fi
    
    echo "\$log_entry" >> "\$LOG_FILE"
    echo "\$log_entry"
}

write_log "INFO" "CyberShield Agent (macOS) started"
write_log "INFO" "Token prefix: \${AGENT_TOKEN:0:8}..."
write_log "INFO" "Server: \$SERVER_URL"

# Collect macOS system information
OS_VERSION=\$(sw_vers -productVersion)
OS_BUILD=\$(sw_vers -buildVersion)
HARDWARE_MODEL=\$(sysctl -n hw.model)
HARDWARE_ARCH=\$(uname -m)
MEMORY_GB=\$(sysctl -n hw.memsize | awk '{print int(\$1/1024/1024/1024)}')

write_log "INFO" "macOS version: \$OS_VERSION (Build: \$OS_BUILD)"
write_log "INFO" "Hardware: \$HARDWARE_MODEL (\$HARDWARE_ARCH)"
write_log "INFO" "Memory: \${MEMORY_GB}GB"

# Generate UUID for nonce
generate_nonce() {
    uuidgen
}

# HMAC-SHA256 signature generation
generate_hmac_signature() {
    local timestamp="\$1"
    local nonce="\$2"
    local body="\$3"
    local payload="\${timestamp}:\${nonce}:\${body}"
    
    # Convert hex secret to binary and compute HMAC
    echo -n "\$payload" | openssl dgst -sha256 -hmac "\$HMAC_SECRET" | awk '{print \$2}'
}

# Send heartbeat with HMAC authentication
send_heartbeat() {
    local timestamp nonce body signature response http_code
    
    timestamp=\$(date +%s%3N)  # milliseconds
    nonce=\$(generate_nonce)
    
    # Enhanced macOS telemetry
    local os_version os_build hardware_model hardware_arch memory_gb cpu_count
    os_version=\$(sw_vers -productVersion)
    os_build=\$(sw_vers -buildVersion)
    hardware_model=\$(sysctl -n hw.model)
    hardware_arch=\$(uname -m)
    memory_gb=\$(sysctl -n hw.memsize | awk '{print int(\$1/1024/1024/1024)}')
    cpu_count=\$(sysctl -n hw.ncpu)
    
    body=$(cat <<EOF
{
  "type": "heartbeat",
  "platform": "macos",
  "os_version": "\$os_version",
  "os_build": "\$os_build",
  "hardware": {
    "model": "\$hardware_model",
    "architecture": "\$hardware_arch",
    "memory_gb": \$memory_gb,
    "cpu_count": \$cpu_count
  }
}
EOF
)
    
    signature=\$(generate_hmac_signature "\$timestamp" "\$nonce" "\$body")
    
    response=\$(curl -sS -w "\\n%{http_code}" -X POST "\${SERVER_URL}/functions/v1/heartbeat" \\
        -H "Content-Type: application/json" \\
        -H "X-Agent-Token: \${AGENT_TOKEN}" \\
        -H "X-HMAC-Signature: \${signature}" \\
        -H "X-Timestamp: \${timestamp}" \\
        -H "X-Nonce: \${nonce}" \\
        --data "\$body" 2>&1) || {
            write_log "ERROR" "Heartbeat failed: curl error"
            return 1
        }
    
    http_code=\$(echo "\$response" | tail -n1)
    
    if [ "\$http_code" = "200" ]; then
        write_log "SUCCESS" "Heartbeat OK"
    else
        write_log "ERROR" "Heartbeat failed: HTTP \$http_code"
    fi
}

# Poll for jobs
poll_jobs() {
    local timestamp nonce body signature response http_code
    
    timestamp=\$(date +%s%3N)
    nonce=\$(generate_nonce)
    body='{}'
    
    signature=\$(generate_hmac_signature "\$timestamp" "\$nonce" "\$body")
    
    response=\$(curl -sS -w "\\n%{http_code}" -X POST "\${SERVER_URL}/functions/v1/poll-jobs" \\
        -H "Content-Type: application/json" \\
        -H "X-Agent-Token: \${AGENT_TOKEN}" \\
        -H "X-HMAC-Signature: \${signature}" \\
        -H "X-Timestamp: \${timestamp}" \\
        -H "X-Nonce: \${nonce}" \\
        --data "\$body" 2>&1) || {
            write_log "WARN" "Poll-jobs failed: curl error"
            return 1
        }
    
    http_code=\$(echo "\$response" | tail -n1)
    
    if [ "\$http_code" = "200" ]; then
        local jobs_data
        jobs_data=\$(echo "\$response" | head -n-1)
        write_log "INFO" "Jobs received: \$jobs_data"
        # TODO: Implement job execution logic
    else
        write_log "WARN" "Poll-jobs failed: HTTP \$http_code"
    fi
}

# Main loop
write_log "INFO" "Entering main loop (interval: \${POLL_INTERVAL}s)"

while true; do
    send_heartbeat
    poll_jobs
    sleep "\$POLL_INTERVAL"
done
`;
