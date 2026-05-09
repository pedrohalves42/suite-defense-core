#!/usr/bin/env bash
#
# CyberShield Agent - Security Detection Module (Linux/macOS)
# EDR telemetry collection for MITRE ATT&CK detection rules
#

get_security_events() {
    local hours="${1:-1}"
    local events='[]'
    local cutoff_epoch
    cutoff_epoch=$(date -d "-${hours} hours" +%s 2>/dev/null || date -v-"${hours}"H +%s 2>/dev/null)

    # --- Failed SSH logins (T1110: Brute Force) ---
    local failed_logins='[]'
    if [[ -f /var/log/auth.log ]]; then
        local count
        count=$(grep -c "Failed password" /var/log/auth.log 2>/dev/null || echo 0)
        if [[ $count -gt 0 ]]; then
            local recent
            recent=$(grep "Failed password" /var/log/auth.log 2>/dev/null | tail -20 |
                jq -R -s 'split("\n") | map(select(length > 0)) | map({
                    event_type: "failed_login",
                    message: .[0:200],
                    timestamp: now | todate,
                    mitre_technique: "T1110"
                })' 2>/dev/null || echo '[]')
            failed_logins="$recent"
        fi
    elif [[ -f /var/log/secure ]]; then
        local count
        count=$(grep -c "Failed password" /var/log/secure 2>/dev/null || echo 0)
        if [[ $count -gt 10 ]]; then
            failed_logins=$(jq -n --argjson c "$count" '[{
                event_type: "brute_force_suspect",
                message: ("High volume of failed SSH logins: " + ($c | tostring)),
                timestamp: (now | todate),
                mitre_technique: "T1110"
            }]')
        fi
    fi

    # --- New cron jobs (T1053.003: Cron) ---
    local cron_events='[]'
    local cron_files; shopt -s nullglob; cron_files=(/var/spool/cron/crontabs/* /etc/cron.d/*); shopt -u nullglob
    for cf in "${cron_files[@]}"; do
        [[ -f "$cf" ]] || continue
        local mod_epoch
        mod_epoch=$(stat -c %Y "$cf" 2>/dev/null || stat -f %m "$cf" 2>/dev/null)
        if [[ -n "$mod_epoch" && "$mod_epoch" -gt "$cutoff_epoch" ]]; then
            cron_events=$(echo "$cron_events" | jq --arg f "$cf" '. + [{
                event_type: "cron_modified",
                file_path: $f,
                timestamp: (now | todate),
                mitre_technique: "T1053.003"
            }]')
        fi
    done

    # --- Suspicious process detection ---
    local proc_events='[]'
    local suspicious_procs
    suspicious_procs=$(ps aux 2>/dev/null)

    # T1059: Reverse shell indicators
    local rev_shells
    rev_shells=$(echo "$suspicious_procs" | grep -iE "bash -i|/dev/tcp|nc -e|ncat.*-e|socat.*exec|python.*socket.*connect" 2>/dev/null | head -5)
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local pname
        pname=$(echo "$line" | awk '{print $11}')
        proc_events=$(echo "$proc_events" | jq --arg cmd "$line" --arg p "$pname" '. + [{
            event_type: "reverse_shell_suspect",
            process_name: $p,
            command_line: ($cmd | .[0:500]),
            timestamp: (now | todate),
            mitre_technique: "T1059"
        }]')
    done <<< "$rev_shells"

    # T1036: Masquerading — process from /tmp or /dev/shm
    local tmp_procs
    tmp_procs=$(echo "$suspicious_procs" | awk '$11 ~ /^\/(tmp|dev\/shm|var\/tmp)/ {print $2, $11}' | head -10)
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local pid ppath
        pid=$(echo "$line" | awk '{print $1}')
        ppath=$(echo "$line" | awk '{print $2}')
        proc_events=$(echo "$proc_events" | jq --arg pid "$pid" --arg path "$ppath" '. + [{
            event_type: "process_masquerading",
            pid: ($pid | tonumber),
            executable_path: $path,
            timestamp: (now | todate),
            mitre_technique: "T1036"
        }]')
    done <<< "$tmp_procs"

    # T1014: Rootkit indicators — hidden processes
    local ps_count proc_count
    ps_count=$(ps aux 2>/dev/null | wc -l)
    proc_count=$(ls /proc/*/status 2>/dev/null | wc -l)
    if [[ $((proc_count - ps_count)) -gt 5 ]]; then
        proc_events=$(echo "$proc_events" | jq --argjson diff "$((proc_count - ps_count))" '. + [{
            event_type: "rootkit_suspect",
            message: ("Hidden processes detected: " + ($diff | tostring) + " processes not visible to ps"),
            timestamp: (now | todate),
            mitre_technique: "T1014"
        }]')
    fi

    # --- Lateral movement detection (T1021) ---
    local lateral_events='[]'
    local ssh_conns
    ssh_conns=$(ss -tnp 2>/dev/null | grep -E ":22\s" | grep "ESTAB" | head -10)
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local remote_addr
        remote_addr=$(echo "$line" | awk '{print $5}' | sed 's/:22$//')
        lateral_events=$(echo "$lateral_events" | jq --arg addr "$remote_addr" '. + [{
            event_type: "lateral_ssh_connection",
            remote_address: $addr,
            remote_port: 22,
            timestamp: (now | todate),
            mitre_technique: "T1021.004"
        }]')
    done <<< "$ssh_conns"

    # --- File integrity (sensitive files) ---
    local file_events='[]'

    # T1098: Account manipulation — /etc/passwd or /etc/shadow modified
    for sensitive_file in /etc/passwd /etc/shadow /etc/sudoers; do
        [[ -f "$sensitive_file" ]] || continue
        local mod_epoch
        mod_epoch=$(stat -c %Y "$sensitive_file" 2>/dev/null || stat -f %m "$sensitive_file" 2>/dev/null)
        if [[ -n "$mod_epoch" && "$mod_epoch" -gt "$cutoff_epoch" ]]; then
            file_events=$(echo "$file_events" | jq --arg f "$sensitive_file" '. + [{
                event_type: "sensitive_file_modified",
                file_path: $f,
                timestamp: (now | todate),
                mitre_technique: "T1098"
            }]')
        fi
    done

    # T1547.004: .bashrc/.profile persistence
    local shell_files; shopt -s nullglob; shell_files=(/root/.bashrc /root/.bash_profile /home/*/.bashrc /home/*/.bash_profile); shopt -u nullglob
    for sf in "${shell_files[@]}"; do
        [[ -f "$sf" ]] || continue
        local mod_epoch
        mod_epoch=$(stat -c %Y "$sf" 2>/dev/null || stat -f %m "$sf" 2>/dev/null)
        if [[ -n "$mod_epoch" && "$mod_epoch" -gt "$cutoff_epoch" ]]; then
            file_events=$(echo "$file_events" | jq --arg f "$sf" '. + [{
                event_type: "shell_profile_modified",
                file_path: $f,
                timestamp: (now | todate),
                mitre_technique: "T1546.004"
            }]')
        fi
    done

    # Combine all events
    events=$(jq -n \
        --argjson fl "$failed_logins" \
        --argjson cr "$cron_events" \
        --argjson pr "$proc_events" \
        --argjson lt "$lateral_events" \
        --argjson fi "$file_events" \
        '$fl + $cr + $pr + $lt + $fi')

    echo "$events"
}

get_network_anomalies() {
    local events='[]'

    # Large outbound connections (T1048)
    local large_conns
    large_conns=$(ss -tnp 2>/dev/null | grep "ESTAB" | awk '{print $5, $6}' | head -50)

    # Unusual outbound ports (T1571)
    local unusual_ports
    unusual_ports=$(ss -tnp state established 2>/dev/null |
        awk -F: '{print $NF}' |
        awk '$1 > 0 && $1 != 80 && $1 != 443 && $1 != 22 && $1 != 53 {print $1}' |
        sort -u | head -20)

    while IFS= read -r port; do
        [[ -z "$port" ]] && continue
        [[ "$port" -lt 1024 ]] && continue
        events=$(echo "$events" | jq --argjson p "$port" '. + [{
            event_type: "unusual_outbound_port",
            remote_port: $p,
            timestamp: (now | todate),
            mitre_technique: "T1571"
        }]')
    done <<< "$unusual_ports"

    echo "$events"
}
