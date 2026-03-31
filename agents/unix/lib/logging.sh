#!/usr/bin/env bash
#
# CyberShield Agent - Buffered Logging
#

flush_log_buffer() {
    if [[ -n "$LOG_BUFFER" ]]; then
        echo -n "$LOG_BUFFER" >> "$LOG_FILE" 2>/dev/null
        LOG_BUFFER=""
        LOG_BUFFER_COUNT=0
        LOG_BUFFER_LAST_FLUSH=$(date +%s)
    fi
}

log() {
    local level="${1:-INFO}"
    local message="$2"
    local timestamp
    if [[ -n "$CACHED_TIMESTAMP" ]]; then
        timestamp="$CACHED_TIMESTAMP"
    else
        timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    fi
    local line="[$timestamp] [$level] [$CURRENT_STATE] $message"
    echo "$line"

    LOG_BUFFER+="$line"$'\n'
    LOG_BUFFER_COUNT=$((LOG_BUFFER_COUNT + 1))
    LOG_CALL_COUNT=$((LOG_CALL_COUNT + 1))

    local now_epoch=${CACHED_EPOCH:-$(date +%s)}
    if [[ $LOG_BUFFER_COUNT -ge $LOG_BUFFER_MAX ]] || \
       [[ "$level" == "ERROR" ]] || \
       [[ $((now_epoch - LOG_BUFFER_LAST_FLUSH)) -ge 10 ]]; then
        flush_log_buffer
    fi

    if [[ $((LOG_CALL_COUNT % LOG_ROTATION_CHECK_INTERVAL)) -eq 0 ]]; then
        local log_size
        log_size=$(_stat_size "$LOG_FILE")
        if [[ $log_size -gt 10485760 ]]; then
            mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S).bak"
        fi
    fi
}
