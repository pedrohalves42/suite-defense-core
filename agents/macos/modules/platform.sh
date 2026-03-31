#!/usr/bin/env bash
#
# CyberShield Agent macOS - Platform Utilities
#

_stat_size() { stat -f%z "$1" 2>/dev/null || echo 0; }

_generate_uuid() { uuidgen 2>/dev/null || date +%s; }

_list_process_names() { ps -eo comm= | sort -u; }
