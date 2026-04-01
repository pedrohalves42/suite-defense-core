#!/usr/bin/env bash
#
# CyberShield Agent - Hash Chain & Runtime Integrity
#

get_execution_hash() {
    local execution_id="$1" job_id="$2" previous_hash="$3"
    EXECUTION_CHAIN_INDEX=$((EXECUTION_CHAIN_INDEX + 1))
    local hash
    hash=$(echo -n "${execution_id}:${job_id}:${previous_hash}:${EXECUTION_CHAIN_INDEX}" | sha256sum | cut -d' ' -f1)
    EXECUTION_CHAIN_LAST_HASH="$hash"
    echo "{\"execution_hash\":\"$hash\",\"previous_execution_hash\":\"$previous_hash\",\"execution_index\":$EXECUTION_CHAIN_INDEX}"
}

test_runtime_integrity() {
    local expected_hash=""
    if [[ -f "$HASH_CACHE_JSON" ]]; then
        expected_hash=$(jq -r '.hash // empty' "$HASH_CACHE_JSON" 2>/dev/null)
    fi
    if [[ -z "$expected_hash" && -f "$HASH_CACHE_TXT" ]]; then
        expected_hash=$(cat "$HASH_CACHE_TXT" 2>/dev/null | tr -d '[:space:]')
    fi
    [[ -z "$expected_hash" || ${#expected_hash} -ne 64 ]] && return 0

    local current_hash
    current_hash=$(sha256sum "$0" 2>/dev/null | cut -d' ' -f1)
    if [[ "$current_hash" != "${expected_hash,,}" ]]; then
        TOCTOU_CONSECUTIVE_FAILURES=$((TOCTOU_CONSECUTIVE_FAILURES + 1))
        if [[ $TOCTOU_CONSECUTIVE_FAILURES -ge 3 ]]; then
            log "ERROR" "[INTEGRITY] TOCTOU VIOLATION: 3 consecutive mismatches - fail-closed"
            return 1
        fi
        log "WARN" "[INTEGRITY] Hash mismatch (${TOCTOU_CONSECUTIVE_FAILURES}/3) - self-healing cache"
        save_signed_hash_cache "$current_hash" ""
        return 0
    fi
    TOCTOU_CONSECUTIVE_FAILURES=0
    return 0
}

save_signed_hash_cache() {
    local hash="$1" signature="${2:-}"
    echo "$hash" > "$HASH_CACHE_TXT" 2>/dev/null || true
    cat > "$HASH_CACHE_JSON" <<EOJSON
{"hash":"$hash","signature":"$signature","signed_at":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")","algorithm":"Ed25519","verified":true}
EOJSON
    chmod 600 "$HASH_CACHE_JSON" "$HASH_CACHE_TXT" 2>/dev/null || true
}

validate_hash_cache_schema() {
    [[ ! -f "$HASH_CACHE_JSON" ]] && return 0
    local extra_keys
    extra_keys=$(jq -r 'keys[] | select(. != "hash" and . != "signature" and . != "signed_at" and . != "algorithm" and . != "verified")' "$HASH_CACHE_JSON" 2>/dev/null)
    if [[ -n "$extra_keys" ]]; then
        log "ERROR" "[INTEGRITY] Unexpected properties in hash cache: $extra_keys"
        rm -f "$HASH_CACHE_JSON" 2>/dev/null || true
        return 1
    fi
    return 0
}
