#!/usr/bin/env bash
#
# CyberShield Agent - Process Baseline
#

initialize_process_baseline() {
    if [[ -f "$PROCESS_BASELINE_PATH" ]]; then
        while IFS= read -r proc; do
            PROCESS_BASELINE+=("$proc")
            PROCESS_BASELINE_MAP["$proc"]=1
        done < <(jq -r '.[].name' "$PROCESS_BASELINE_PATH" 2>/dev/null)
        log "INFO" "[BASELINE] Loaded ${#PROCESS_BASELINE[@]} processes"
    else
        log "INFO" "[BASELINE] Creating initial baseline..."
        local baseline='[' first=true ts
        ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        for proc in $(_list_process_names); do
            [[ "$first" == "true" ]] && first=false || baseline+=','
            baseline+="{\"name\":\"$proc\",\"first_seen\":\"$ts\"}"
            PROCESS_BASELINE+=("$proc")
            PROCESS_BASELINE_MAP["$proc"]=1
        done
        baseline+=']'
        echo "$baseline" > "$PROCESS_BASELINE_PATH"
        log "SUCCESS" "[BASELINE] Created with ${#PROCESS_BASELINE[@]} processes"
    fi
}

get_process_anomalies() {
    local anomaly_count=0
    for proc in $(_list_process_names); do
        if [[ -z "${PROCESS_BASELINE_MAP[$proc]+_}" ]]; then
            anomaly_count=$((anomaly_count + 1))
            PROCESS_BASELINE+=("$proc")
            PROCESS_BASELINE_MAP["$proc"]=1
        fi
    done
    echo '{"anomaly_count":'$anomaly_count'}'
}
