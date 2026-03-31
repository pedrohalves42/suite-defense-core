#!/usr/bin/env bash
#
# CyberShield Agent Linux - Auto-Repair (disk cleanup)
#

_auto_repair() {
    local disk_usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
    if [[ "$disk_usage" -ge "$DISK_CLEANUP_THRESHOLD" ]]; then
        find /tmp -type f -mtime +7 -delete 2>/dev/null || true
        find /var/tmp -type f -mtime +7 -delete 2>/dev/null || true
        command -v journalctl &>/dev/null && journalctl --vacuum-time=7d 2>/dev/null || true
        command -v apt-get &>/dev/null && apt-get clean 2>/dev/null || true
        AUTO_REPAIR_DISK_CLEANUPS=$((AUTO_REPAIR_DISK_CLEANUPS + 1))
    fi
}
