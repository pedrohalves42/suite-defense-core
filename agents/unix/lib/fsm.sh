#!/usr/bin/env bash
#
# CyberShield Agent - FSM State Machine
#

set_agent_state() {
    local new_state="$1"
    local reason="${2:-}"
    local old_state="$CURRENT_STATE"

    [[ "$old_state" == "$new_state" ]] && return 0

    local allowed="${STATE_TRANSITIONS[$old_state]}"
    if [[ ! " $allowed " =~ " $new_state " ]]; then
        log "ERROR" "[FSM] Invalid transition: $old_state -> $new_state (allowed: $allowed)"
        return 1
    fi

    local old_val=\"$CURRENT_STATE\"
    CURRENT_STATE=\"$new_state\"
    log \"INFO\" \"[FSM] State transition: $old_state -> $new_state (Reason: $reason)\"

    # BUG 16: Ensure state is persisted before confirming transition in memory
    if ! cat > \"$STATE_PATH\" <<EOF
{\"state\":\"$new_state\",\"previous_state\":\"$old_state\",\"transition_at\":\"$(date -u +\"%Y-%m-%dT%H:%M:%SZ\")\",\"reason\":\"$reason\"}
EOF
    then
        log \"ERROR\" \"[FSM] Failed to persist state to $STATE_PATH. Reverting to $old_val\"
        CURRENT_STATE=\"$old_val\"
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
