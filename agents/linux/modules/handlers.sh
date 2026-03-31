#!/usr/bin/env bash
#
# CyberShield Agent Linux - Job Handlers Module
# All job type dispatchers live here.
#

dispatch_job_handler() {
    local job_type="$1" job="$2"
    case "$job_type" in
        "software_inventory_collect") _collect_software_inventory ;;
        "collect_antivirus_status")   _collect_antivirus_status ;;
        "collect_network_info")       collect_network_info ;;
        "kill_process")               _kill_process_handler "$job" ;;
        "stop_service")               _stop_service_handler "$job" ;;
        "disable_service")            _disable_service_handler "$job" ;;
        "restart_service")            _restart_service_handler "$job" ;;
        "collect_web_activity")       _collect_web_activity ;;
        "light_vuln_scan")            _light_vuln_scan ;;
        "update_agent")               update_agent_handler ;;
        "scan")                       _scan_handler ;;
        "report")                     _report_handler ;;
        "collect_info")               _collect_info ;;
        "reinstall_agent")            _reinstall_agent ;;
        "collect_dns_blocks")         _collect_dns_blocks ;;
        "remove_dns_filter")          _remove_dns_filter ;;
        "integration_test_v3")        integration_test_handler ;;
        "disk_cleanup")               _disk_cleanup_handler ;;
        "network_diagnostics")        _network_diagnostics "$job" ;;
        "service_health_check")       _service_health_check "$job" ;;
        *) echo '{"error":"Unknown job type: '"$job_type"'"}'; return 1 ;;
    esac
}

_collect_software_inventory() {
    local list count
    list=$(dpkg-query -W -f='{"name":"${Package}","version":"${Version}"},\n' 2>/dev/null | sed '$ s/,$//' | tr -d '\n' || echo '{}')
    count=$(dpkg-query -W 2>/dev/null | wc -l || echo 0)
    echo '{"software_count":'"$count"',"software_list":['"$list"'],"collected_at":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"}'
}

_collect_antivirus_status() {
    local av='[]'
    if command -v clamscan &>/dev/null; then
        local ver
        ver=$(clamscan --version 2>/dev/null | head -1 || echo "unknown")
        av='[{"name":"ClamAV","version":"'"$ver"'","state":"installed"}]'
    fi
    echo '{"antivirus_products":'"$av"',"collected_at":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"}'
}

_kill_process_handler() {
    local job="$1"
    local pname force
    pname=$(echo "$job" | jq -r '.payload.process_name // empty' 2>/dev/null)
    force=$(echo "$job" | jq -r '.payload.force // false' 2>/dev/null)
    [[ -z "$pname" ]] && { echo '{"success":false,"error":"Missing process_name"}'; return; }

    local norm
    norm=$(echo "$pname" | tr '[:upper:]' '[:lower:]')
    if echo "$PROTECTED_PROCESSES" | grep -qw "$norm"; then
        echo '{"success":false,"error":"SECURITY_BLOCK: protected process","blocked":true}'
        return
    fi

    local pids killed=0 total=0
    pids=$(pgrep -x "$pname" 2>/dev/null)
    [[ -z "$pids" ]] && { echo '{"success":true,"killed":0}'; return; }

    for pid in $pids; do
        total=$((total + 1))
        if [[ "$force" == "true" ]]; then kill -9 "$pid" 2>/dev/null && killed=$((killed + 1))
        else kill "$pid" 2>/dev/null && killed=$((killed + 1)); fi
    done
    echo '{"success":true,"killed":'"$killed"',"total_found":'"$total"'}'
}

_stop_service_handler() {
    local job="$1"
    local svc
    svc=$(echo "$job" | jq -r '.payload.service_name // empty' 2>/dev/null)
    [[ -z "$svc" ]] && { echo '{"success":false,"error":"Missing service_name"}'; return; }
    echo "$PROTECTED_SERVICES" | grep -qw "$svc" && { echo '{"success":false,"error":"SECURITY_BLOCK","blocked":true}'; return; }
    systemctl stop "$svc" 2>/dev/null && echo '{"success":true,"service":"'"$svc"'","status":"stopped"}' || echo '{"success":false,"error":"Failed to stop"}'
}

_disable_service_handler() {
    local job="$1"
    local svc
    svc=$(echo "$job" | jq -r '.payload.service_name // empty' 2>/dev/null)
    [[ -z "$svc" ]] && { echo '{"success":false,"error":"Missing service_name"}'; return; }
    echo "$PROTECTED_SERVICES" | grep -qw "$svc" && { echo '{"success":false,"error":"SECURITY_BLOCK","blocked":true}'; return; }
    systemctl stop "$svc" 2>/dev/null; systemctl disable "$svc" 2>/dev/null
    echo '{"success":true,"service":"'"$svc"'","status":"disabled"}'
}

_restart_service_handler() {
    local job="$1"
    local svc
    svc=$(echo "$job" | jq -r '.payload.service_name // empty' 2>/dev/null)
    [[ -z "$svc" ]] && { echo '{"success":false,"error":"Missing service_name"}'; return; }
    systemctl restart "$svc" 2>/dev/null && echo '{"success":true,"service":"'"$svc"'"}' || echo '{"success":false,"error":"Failed to restart"}'
}

_collect_web_activity() {
    local dns='[]' browser='[]'
    [[ -f /etc/resolv.conf ]] && dns=$(grep -v '^#' /etc/resolv.conf | grep -v '^$' | jq -R -s '[split("\n")[] | select(length>0) | {entry:.}]' 2>/dev/null || echo '[]')
    echo '{"dns_cache":'"$dns"',"browser_history":'"$browser"',"source":"linux"}'
}

_light_vuln_scan() {
    local vulns='[]' tool="none" total=0
    if command -v apt-get &>/dev/null; then
        tool="apt"
        local sec
        sec=$(apt-get -s upgrade 2>/dev/null | grep -i "^Inst" | grep -i "security" | head -20 || echo "")
        [[ -n "$sec" ]] && total=$(echo "$sec" | wc -l)
    fi
    echo '{"vulnerabilities":'"$vulns"',"summary":{"total":'"$total"'},"scan_tool":"'"$tool"'","platform":"linux"}'
}

_scan_handler() {
    local ports users
    ports=$(ss -tlnp 2>/dev/null | tail -n +2 | awk '{print $4}' | head -20 | jq -R -s '[split("\n")[] | select(length>0)]' 2>/dev/null || echo '[]')
    users=$(who 2>/dev/null | jq -R -s '[split("\n")[] | select(length>0)]' 2>/dev/null || echo '[]')
    echo '{"open_ports":'"$ports"',"logged_users":'"$users"'}'
}

_report_handler() {
    local disk mem
    disk=$(df -BG / | tail -1 | awk '{print "{\"total\":\""$2"\",\"used\":\""$3"\",\"free\":\""$4"\",\"percent\":\""$5"\"}"}')
    mem=$(free -m 2>/dev/null | awk '/^Mem:/ {print "{\"total_mb\":"$2",\"used_mb\":"$3"}"}' || echo '{}')
    echo '{"agent_version":"'"$AGENT_VERSION"'",'"$disk"',"memory":'"$mem"'}'
}

_collect_info() {
    local kernel arch
    kernel=$(uname -r 2>/dev/null || echo "unknown")
    arch=$(uname -m 2>/dev/null || echo "unknown")
    echo '{"kernel":"'"$kernel"'","architecture":"'"$arch"'","hostname":"'"$(hostname)"'","agent_version":"'"$AGENT_VERSION"'"}'
}

_reinstall_agent() {
    echo '{"success":true,"message":"Reinstall delegated to force_update mechanism"}'
}

_collect_dns_blocks() {
    local blocks='[]'
    [[ -f /etc/hosts ]] && blocks=$(grep -E "^(0\.0\.0\.0|127\.0\.0\.1)" /etc/hosts | grep -v "localhost" | awk '{print $2}' | head -100 | jq -R -s '[split("\n")[] | select(length>0)]' 2>/dev/null || echo '[]')
    echo '{"blocked_domains":'"$blocks"',"source":"/etc/hosts"}'
}

_remove_dns_filter() {
    [[ -f /etc/hosts ]] && sudo sed -i '/# CyberShield DNS Block/,/# End CyberShield DNS Block/d' /etc/hosts 2>/dev/null
    echo '{"success":true}'
}

_disk_cleanup_handler() {
    local before
    before=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
    sudo find /tmp -type f -atime +7 -delete 2>/dev/null
    sudo find /var/tmp -type f -atime +7 -delete 2>/dev/null
    local after
    after=$(df -BG / | tail -1 | awk '{print $4}' | tr -d 'G')
    echo '{"success":true,"freed_gb":'$((after - before))'}'
}

_network_diagnostics() {
    local job="$1"
    local targets
    targets=$(echo "$job" | jq -r '.payload.targets // ["8.8.8.8"] | .[]' 2>/dev/null)
    local results='[]'
    while IFS= read -r t; do
        [[ -z "$t" ]] && continue
        local ok=false
        ping -c 1 -W 3 "$t" &>/dev/null && ok=true
        results=$(echo "$results" | jq --arg t "$t" --argjson ok "$ok" '. + [{"target":$t,"reachable":$ok}]')
    done <<< "$targets"
    echo '{"diagnostics":'"$results"'}'
}

_service_health_check() {
    local job="$1"
    local svcs
    svcs=$(echo "$job" | jq -r '.payload.services // ["sshd","cron"] | .[]' 2>/dev/null)
    local results='[]' checked=0
    while IFS= read -r svc; do
        [[ -z "$svc" ]] && continue
        local status="unknown"
        systemctl is-active "$svc" &>/dev/null && status="running" || status="stopped"
        results=$(echo "$results" | jq --arg n "$svc" --arg s "$status" '. + [{"name":$n,"status":$s}]')
        checked=$((checked + 1))
    done <<< "$svcs"
    echo '{"services_checked":'"$checked"',"services":'"$results"'}'
}
