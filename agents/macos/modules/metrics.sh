#!/usr/bin/env bash
#
# CyberShield Agent macOS - System Metrics Collection
#

_get_cpu_percent() {
    top -l 1 -n 0 2>/dev/null | awk '/CPU usage/ {gsub(/%/,""); print $3}' | head -1 || echo 0
}

_get_system_metrics() {
    local cpu_percent mem_total mem_used mem_percent
    cpu_percent=$(_get_cpu_percent)
    mem_total=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
    local pages_free pages_active page_size
    page_size=$(sysctl -n hw.pagesize 2>/dev/null || echo 4096)
    pages_free=$(vm_stat 2>/dev/null | awk '/Pages free/ {gsub(/\./,"",$3); print $3}')
    pages_active=$(vm_stat 2>/dev/null | awk '/Pages active/ {gsub(/\./,"",$3); print $3}')
    mem_used=$(( (pages_active * page_size) ))
    mem_percent=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc 2>/dev/null || echo 0)

    local disk_percent uptime_seconds
    disk_percent=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
    uptime_seconds=$(sysctl -n kern.boottime 2>/dev/null | awk '{gsub(/[{},]/,""); for(i=1;i<=NF;i++) if($i=="sec") print $(i+1)}' || echo 0)
    local now
    now=$(date +%s)
    uptime_seconds=$((now - uptime_seconds))

    echo '{"cpu_percent":'"${cpu_percent:-0}"',"memory_total_gb":'$(echo "scale=2; $mem_total / 1073741824" | bc 2>/dev/null || echo 0)',"memory_used_percent":'"${mem_percent:-0}"',"disk_used_percent":'"${disk_percent:-0}"',"uptime_seconds":'"${uptime_seconds:-0}"'}'
}

_get_top_processes() {
    local top_cpu top_mem total
    top_cpu=$(ps aux -r | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
    top_mem=$(ps aux -m | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
    total=$(ps aux | wc -l)
    echo '{"top_by_cpu":['"$top_cpu"'],"top_by_memory":['"$top_mem"'],"total_processes":'"$total"'}'
}
