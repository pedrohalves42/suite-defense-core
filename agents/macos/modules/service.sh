#!/usr/bin/env bash
#
# CyberShield Agent macOS - Service Health (launchd)
#

_check_service_health() {
    local plist_path="/Library/LaunchDaemons/com.cybershield.agent.plist"
    [[ ! -f "$plist_path" ]] && return 0

    if ! launchctl list 2>/dev/null | grep -q "com.cybershield.agent"; then
        launchctl load "$plist_path" 2>/dev/null && log "SUCCESS" "[SERVICE] Reloaded launchd agent"
    fi
}
