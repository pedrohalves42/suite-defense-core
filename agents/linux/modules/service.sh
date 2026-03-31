#!/usr/bin/env bash
#
# CyberShield Agent Linux - Service Health (systemd)
#

_check_service_health() {
    local service_name=""
    for pattern in "cybershield-agent" "cybershield"; do
        if systemctl list-units --type=service --all 2>/dev/null | grep -q "$pattern"; then
            service_name="$pattern"; break
        fi
    done
    [[ -z "$service_name" ]] && return 0

    local is_active is_enabled
    is_active=$(systemctl is-active "$service_name" 2>/dev/null || echo "unknown")
    is_enabled=$(systemctl is-enabled "$service_name" 2>/dev/null || echo "unknown")

    if [[ "$is_active" != "active" ]]; then
        systemctl start "$service_name" 2>/dev/null && log "SUCCESS" "[SERVICE] Restarted $service_name"
    fi
    if [[ "$is_enabled" != "enabled" ]]; then
        systemctl enable "$service_name" 2>/dev/null && log "SUCCESS" "[SERVICE] Re-enabled $service_name"
    fi
}
