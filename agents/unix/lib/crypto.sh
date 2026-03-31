#!/usr/bin/env bash
#
# CyberShield Agent - ECDSA P-256 Key Management & Signing
#

generate_signing_keypair() {
    log "INFO" "[KEYS] Generating new ECDSA P-256 keypair..."
    local max_attempts=3 attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        if [[ -f "$PRIVATE_KEY_PATH" ]]; then
            cp "$PRIVATE_KEY_PATH" "$PREVIOUS_KEY_PATH" 2>/dev/null || true
        fi
        if [[ $attempt -gt 1 ]]; then
            rm -f "$PRIVATE_KEY_PATH" "$PUBLIC_KEY_PATH" 2>/dev/null || true
            sleep 1
        fi

        if openssl ecparam -genkey -name prime256v1 -noout -out "$PRIVATE_KEY_PATH" 2>/dev/null; then
            chmod 600 "$PRIVATE_KEY_PATH"
            if openssl ec -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH" 2>/dev/null; then
                local fingerprint
                fingerprint=$(openssl dgst -sha256 -binary "$PUBLIC_KEY_PATH" | xxd -p | tr -d '\n')
                echo "$fingerprint" > "$FINGERPRINT_PATH"
                SIGNING_FINGERPRINT="$fingerprint"
                log "SUCCESS" "[KEYS] Keypair generated (fingerprint: ${fingerprint:0:16}...)"
                echo "$fingerprint"
                return 0
            fi
        fi
        attempt=$((attempt + 1))
    done
    log "ERROR" "[KEYS] All ECDSA attempts failed. Signing DISABLED."
    return 1
}

initialize_agent_keys() {
    if [[ -f "$PRIVATE_KEY_PATH" && -f "$PUBLIC_KEY_PATH" && -f "$FINGERPRINT_PATH" ]]; then
        SIGNING_FINGERPRINT=$(cat "$FINGERPRINT_PATH" 2>/dev/null)
        log "INFO" "[KEYS] Loaded existing keypair (fingerprint: ${SIGNING_FINGERPRINT:0:16}...)"
        return 0
    fi
    SIGNING_FINGERPRINT=$(generate_signing_keypair)
    [[ -z "$SIGNING_FINGERPRINT" ]] && return 1
    return 0
}

register_agent_key() {
    local public_key_b64
    public_key_b64=$(base64 -w0 "$PUBLIC_KEY_PATH" 2>/dev/null || base64 "$PUBLIC_KEY_PATH" 2>/dev/null)
    local body='{"public_key":"'"$public_key_b64"'","key_fingerprint":"'"$SIGNING_FINGERPRINT"'","algorithm":"ECDSA-P256-SHA256"}'
    local result
    result=$(invoke_secure_request "POST" "/functions/v1/register-agent-key" "$body" 30)
    if [[ $? -eq 0 ]]; then
        KEY_VERSION=$(echo "$result" | jq -r '.version // 1' 2>/dev/null)
        log "SUCCESS" "[KEYS] Public key registered (version: $KEY_VERSION)"
        return 0
    fi
    log "WARN" "[KEYS] Failed to register public key"
    return 1
}

sign_execution_result() {
    local canonical="${1}:${2}:${3}:${4}:${5}"
    echo -n "$canonical" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" 2>/dev/null | base64 -w0 2>/dev/null || base64 2>/dev/null
}
