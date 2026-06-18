#!/usr/bin/env bash
#
# CyberShield Agent Linux - Forced Update (systemd-aware)
# v2.0: Added Ed25519 signature verification (SSA-004)
#

_apply_forced_update() {
    local response="$1"
    local target_version base64_content expected_hash
    target_version=$(echo "$response" | jq -r '.target_version // ""' 2>/dev/null)
    base64_content=$(echo "$response" | jq -r '.script_content_base64 // ""' 2>/dev/null)
    expected_hash=$(echo "$response" | jq -r '.sha256 // ""' 2>/dev/null)

    [[ -z "$target_version" || -z "$base64_content" || -z "$expected_hash" ]] && return 1

    local temp_script="/tmp/cybershield-force-update-${target_version}.sh"
    echo "$base64_content" | base64 -d > "$temp_script" 2>/dev/null
    [[ ! -s "$temp_script" ]] && { rm -f "$temp_script"; return 1; }

    local actual_hash expected_lc
    actual_hash=$(sha256sum "$temp_script" | awk '{print $1}' | tr 'A-F' 'a-f')
    expected_lc=$(printf '%s' "$expected_hash" | tr 'A-F' 'a-f')
    [[ "$actual_hash" != "$expected_lc" ]] && { rm -f "$temp_script"; return 1; }

    # SSA-004: Verify Ed25519 signature on update payload
    local update_signature
    update_signature=$(echo "$response" | jq -r '.ecdsa_signature // .signature_base64 // ""' 2>/dev/null)
    local ed25519_pubkey_path="${BASE_DIR:-/opt/cybershield}/keys/ed25519_server.pub"

    if [[ -n "$update_signature" && ${#update_signature} -gt 10 ]]; then
        # Signature provided — must verify
        if [[ -f "$ed25519_pubkey_path" ]] && command -v openssl &>/dev/null; then
            local _tmp_hash _tmp_sig
            _tmp_hash=$(mktemp) || { log "ERROR" "[FORCE UPDATE] mktemp failed"; rm -f "$temp_script"; return 1; }
            _tmp_sig=$(mktemp) || { rm -f "$_tmp_hash"; log "ERROR" "[FORCE UPDATE] mktemp failed"; rm -f "$temp_script"; return 1; }
            echo -n "$actual_hash" > "$_tmp_hash"
            echo "$update_signature" | base64 -d > "$_tmp_sig" 2>/dev/null
            if ! openssl pkeyutl -verify -pubin -inkey "$ed25519_pubkey_path" \
                -sigfile "$_tmp_sig" -rawin -in "$_tmp_hash" 2>/dev/null; then
                log "ERROR" "[FORCE UPDATE] REJECTED - Ed25519 signature INVALID! Possible supply chain attack."
                logger -t CyberShield -p auth.err "FORCE UPDATE REJECTED: Invalid Ed25519 signature. SHA256: $actual_hash"
                rm -f "$temp_script" "$_tmp_hash" "$_tmp_sig"
                return 1
            fi
            rm -f "$_tmp_hash" "$_tmp_sig"
            log "SUCCESS" "[FORCE UPDATE] Ed25519 signature VERIFIED for update payload"
        else
            # SEC-010: Fail-closed — reject if signature present but cannot verify
            log "ERROR" "[FORCE UPDATE] REJECTED - Ed25519 public key or openssl not available. Cannot verify signature (SEC-010 fail-closed)."
            logger -t CyberShield -p auth.err "FORCE UPDATE REJECTED: Ed25519 verification infrastructure missing."
            rm -f "$temp_script"
            return 1
        fi
    elif [[ -f "$ed25519_pubkey_path" ]]; then
        # No signature but Ed25519 public key is deployed — reject unsigned (fail-closed)
        log "ERROR" "[FORCE UPDATE] REJECTED - No cryptographic signature on update payload. Unsigned updates blocked."
        logger -t CyberShield -p auth.err "Update rejected: missing cryptographic signature (unsigned payloads blocked)"
        rm -f "$temp_script"
        return 1
    else
        # Legacy mode: no signature, no public key — accept with SHA-256 only
        log "WARN" "[FORCE UPDATE] No Ed25519 public key deployed - accepting update based on SHA-256 only"
    fi

    local current_script
    current_script=$(readlink -f "$0" 2>/dev/null || echo "$0")
    [[ -f "$current_script" ]] && cp "$current_script" "${current_script}.backup" 2>/dev/null
    chmod +x "$temp_script"
    cp "$temp_script" "$current_script" 2>/dev/null
    rm -f "$temp_script"

    # Restart mechanism: favor systemd if available, else re-exec
    if command -v systemctl &>/dev/null && systemctl is-active cybershield-agent &>/dev/null; then
        log "INFO" "[FORCE UPDATE] Restarting service via systemd..."
        systemctl restart cybershield-agent 2>/dev/null &
        exit 0
    else
        log "INFO" "[FORCE UPDATE] Re-executing script..."
        # Use nohup to survive shell termination during update
        nohup "$current_script" \
            --server-url "$SERVER_URL" \
            --agent-token "$AGENT_TOKEN" \
            --hmac-secret "$HMAC_SECRET" \
            --agent-name "$AGENT_NAME" >/dev/null 2>&1 &
        exit 0
    fi
}
