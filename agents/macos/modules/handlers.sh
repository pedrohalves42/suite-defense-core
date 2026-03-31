#!/usr/bin/env bash
#
# CyberShield Agent macOS - Job Handlers Module
#

dispatch_job_handler() {
    local job_type="$1" job="$2"
    case "$job_type" in
        "software_inventory_collect") _collect_software_inventory ;;
        "collect_antivirus_status")   _collect_antivirus_status ;;
        "collect_network_info")       collect_network_info ;;
        "kill_process")               _kill_process_handler "$job" ;;
        "stop_service")               _stop_service_handler "$job" ;;
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
        *) echo '{"error":"Unknown job type: '"$job_type"'"}'; return 1 ;;
    esac
}

_collect_software_inventory() {
    local list count
    # macOS uses system_profiler for software list
    count=$(system_profiler SPApplicationsDataType 2>/dev/null | grep -c "Location:" || echo 0)
    echo '{"software_count":'"$count"',"collected_at":"'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'","source":"system_profiler"}'
}

_collect_antivirus_status() {
    local av='[]'
    # Check for XProtect (built-in)
    if [[ -d "/Library/Apple/System/Library/CoreServices/XProtect.app" ]]; then
        av='[{"name":"XProtect","state":"installed","built_in":true}]'
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
    # macOS uses launchctl
    launchctl unload "/Library/LaunchDaemons/$svc.plist" 2>/dev/null && echo '{"success":true,"service":"'"$svc"'","status":"unloaded"}' || echo '{"success":false,"error":"Failed to unload"}'
}

_restart_service_handler() {
    local job="$1"
    local svc
    svc=$(echo "$job" | jq -r '.payload.service_name // empty' 2>/dev/null)
    [[ -z "$svc" ]] && { echo '{"success":false,"error":"Missing service_name"}'; return; }
    launchctl unload "/Library/LaunchDaemons/$svc.plist" 2>/dev/null
    launchctl load "/Library/LaunchDaemons/$svc.plist" 2>/dev/null
    echo '{"success":true,"service":"'"$svc"'","status":"reloaded"}'
}

_collect_web_activity() {
    local dns='[]' browser='[]'
    # macOS DNS cache
    if command -v dscacheutil &>/dev/null; then
        dns=$(dscacheutil -cachedump 2>/dev/null | head -20 | jq -R -s '[split("\n")[] | select(length>0) | {entry:.}]' 2>/dev/null || echo '[]')
    fi
    echo '{"dns_cache":'"$dns"',"browser_history":'"$browser"',"source":"macos"}'
}

_light_vuln_scan() {
    local total=0
    if command -v softwareupdate &>/dev/null; then
        total=$(softwareupdate --list 2>/dev/null | grep -c "\*" || echo 0)
    fi
    echo '{"summary":{"total":'"$total"'},"scan_tool":"softwareupdate","platform":"macos"}'
}

_scan_handler() {
    local ports users
    ports=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | head -20 | jq -R -s '[split("\n")[] | select(length>0)]' 2>/dev/null || echo '[]')
    users=$(who 2>/dev/null | jq -R -s '[split("\n")[] | select(length>0)]' 2>/dev/null || echo '[]')
    echo '{"open_ports":'"$ports"',"logged_users":'"$users"'}'
}

_report_handler() {
    local disk mem
    disk=$(df -g / | tail -1 | awk '{print "{\"total\":\""$2"G\",\"used\":\""$3"G\",\"free\":\""$4"G\",\"percent\":\""$5"\"}"}')
    mem='{}' # macOS doesn't have free
    echo '{"agent_version":"'"$AGENT_VERSION"'",'"$disk"',"memory":'"$mem"'}'
}

_collect_info() {
    local kernel arch
    kernel=$(uname -r 2>/dev/null || echo "unknown")
    arch=$(uname -m 2>/dev/null || echo "unknown")
    local macos_ver
    macos_ver=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
    echo '{"kernel":"'"$kernel"'","architecture":"'"$arch"'","macos_version":"'"$macos_ver"'","hostname":"'"$(hostname)"'","agent_version":"'"$AGENT_VERSION"'"}'
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
    [[ -f /etc/hosts ]] && sudo sed -i '' '/# CyberShield DNS Block/,/# End CyberShield DNS Block/d' /etc/hosts 2>/dev/null
    echo '{"success":true}'
}

_disk_cleanup_handler() {
    local before
    before=$(df -g / | tail -1 | awk '{print $4}')
    sudo find /tmp -type f -atime +7 -delete 2>/dev/null
    sudo find /private/var/tmp -type f -atime +7 -delete 2>/dev/null
    local after
    after=$(df -g / | tail -1 | awk '{print $4}')
    echo '{"success":true,"freed_gb":'$((after - before))'}'
}
