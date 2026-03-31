#!/usr/bin/env bash
#
# CyberShield Agent Linux - System Metrics Collection
#

_get_cpu_percent() {
    awk '{u=$2+$4; t=$2+$4+$5; if(t>0) printf "%.0f", u*100/t; else print "0"}' /proc/stat 2>/dev/null | head -1 || echo 0
}

_get_system_metrics() {
    local cpu_percent mem_total mem_free mem_used mem_percent
    cpu_percent=$(_get_cpu_percent)
    mem_total=$(awk '/MemTotal/ {print $2 * 1024}' /proc/meminfo 2>/dev/null || echo 0)
    mem_free=$(awk '/MemAvailable/ {print $2 * 1024}' /proc/meminfo 2>/dev/null || echo 0)
    mem_used=$((mem_total - mem_free))
    mem_percent=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc 2>/dev/null || echo 0)

    local disk_info disk_total disk_used disk_percent uptime_seconds
    disk_info=$(df / | tail -1)
    disk_total=$(echo "$disk_info" | awk '{print $2}')
    disk_percent=$(echo "$disk_info" | awk '{print $5}' | tr -d '%')
    uptime_seconds=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)

    echo '{"cpu_percent":'"$cpu_percent"',"memory_total_gb":'$(echo "scale=2; $mem_total / 1073741824" | bc 2>/dev/null || echo 0)',"memory_used_percent":'"$mem_percent"',"disk_used_percent":'"$disk_percent"',"uptime_seconds":'"$uptime_seconds"'}'
}

_get_top_processes() {
    local top_cpu top_mem total
    top_cpu=$(ps aux --sort=-%cpu | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
    top_mem=$(ps aux --sort=-%mem | awk 'NR>1 && NR<=6 {printf "{\"name\":\"%s\",\"pid\":%s,\"cpu_percent\":%.1f,\"memory_mb\":%.1f},", $11, $2, $3, $6/1024}' | sed 's/,$//')
    total=$(ps aux | wc -l)
    echo '{"top_by_cpu":['"$top_cpu"'],"top_by_memory":['"$top_mem"'],"total_processes":'"$total"'}'
}
