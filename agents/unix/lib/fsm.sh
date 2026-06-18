#!/usr/bin/env bash
#
# CyberShield Agent - FSM State Machine
#

set_agent_state() {
    local new_state="$1"
    local reason="${2:-}"
    local old_state="$CURRENT_STATE"

    [[ "$old_state" == "$new_state" ]] && return 0

    local allowed="${STATE_TRANSITIONS[$old_state]:-}"
    if [[ -z "$allowed" ]] || [[ ! " $allowed " == *" $new_state "* ]]; then
        log "ERROR" "[FSM] Invalid transition: $old_state -> $new_state (allowed: ${allowed:-<none>})"
        return 1
    fi

    CURRENT_STATE="$new_state"
    log "INFO" "[FSM] State transition: $old_state -> $new_state (Reason: $reason)"

    # Persist state atomically. On failure revert in-memory transition.
    local tmp_path="${STATE_PATH}.tmp.$$"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")
    if ! cat > "$tmp_path" <<EOF
{"state":"$new_state","previous_state":"$old_state","transition_at":"$now","reason":"$reason"}
EOF
    then
        log "ERROR" "[FSM] Failed to write state tmp file. Reverting to $old_state"
        rm -f "$tmp_path" 2>/dev/null || true
        CURRENT_STATE="$old_state"
        return 1
    fi
    if ! mv -f "$tmp_path" "$STATE_PATH" 2>/dev/null; then
        log "ERROR" "[FSM] Failed to persist state to $STATE_PATH. Reverting to $old_state"
        rm -f "$tmp_path" 2>/dev/null || true
        CURRENT_STATE="$old_state"
        return 1
    fi
    return 0
}

get_saved_state() {
    if [[ -f "$STATE_PATH" ]]; then
        jq -r '.state // "INITIALIZING"' "$STATE_PATH" 2>/dev/null || echo "INITIALIZING"
    else
        echo "INITIALIZING"
    fi
}
