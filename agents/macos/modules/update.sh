#!/usr/bin/env bash
#
# CyberShield Agent macOS - Forced Update (launchd-aware)
#

_apply_forced_update() {
    local response="$1"
    local target_version base64_content expected_hash
    target_version=$(echo "$response" | jq -r '.target_version // ""' 2>/dev/null)
    base64_content=$(echo "$response" | jq -r '.script_content_base64 // ""' 2>/dev/null)
    expected_hash=$(echo "$response" | jq -r '.sha256 // ""' 2>/dev/null)

    [[ -z "$target_version" || -z "$base64_content" || -z "$expected_hash" ]] && return 1

    local temp_script="/tmp/cybershield-force-update-${target_version}.sh"
    echo "$base64_content" | base64 -D > "$temp_script" 2>/dev/null || echo "$base64_content" | base64 -d > "$temp_script" 2>/dev/null
    [[ ! -s "$temp_script" ]] && { rm -f "$temp_script"; return 1; }

    local actual_hash
    actual_hash=$(shasum -a 256 "$temp_script" | awk '{print $1}')
    [[ "${actual_hash,,}" != "${expected_hash,,}" ]] && { rm -f "$temp_script"; return 1; }

    local current_script
    current_script=$(readlink "$0" 2>/dev/null || echo "$0")
    [[ -f "$current_script" ]] && cp "$current_script" "${current_script}.backup" 2>/dev/null
    chmod +x "$temp_script"
    cp "$temp_script" "$current_script" 2>/dev/null
    rm -f "$temp_script"

    if launchctl list 2>/dev/null | grep -q "com.cybershield.agent"; then
        launchctl unload "/Library/LaunchDaemons/com.cybershield.agent.plist" 2>/dev/null
        launchctl load "/Library/LaunchDaemons/com.cybershield.agent.plist" 2>/dev/null
    else
        exec "$current_script" --server-url "$SERVER_URL" --agent-token "$AGENT_TOKEN" --hmac-secret "$HMAC_SECRET" --agent-name "$AGENT_NAME" &
    fi
    exit 0
}
