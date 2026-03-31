#!/usr/bin/env bash
#
# CyberShield Agent macOS - Auto-Repair (disk cleanup)
#

_auto_repair() {
    local disk_usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
    if [[ "$disk_usage" -ge "$DISK_CLEANUP_THRESHOLD" ]]; then
        find /tmp -type f -mtime +7 -delete 2>/dev/null || true
        find /private/var/tmp -type f -mtime +7 -delete 2>/dev/null || true
        AUTO_REPAIR_DISK_CLEANUPS=$((AUTO_REPAIR_DISK_CLEANUPS + 1))
    fi
}
