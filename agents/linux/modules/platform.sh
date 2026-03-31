#!/usr/bin/env bash
#
# CyberShield Agent Linux - Platform Utilities
# UUID, stat, process listing
#

_stat_size() { stat -c%s "$1" 2>/dev/null || echo 0; }

_generate_uuid() {
    cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || date +%s%N
}

_list_process_names() { ps -eo comm= | sort -u; }
