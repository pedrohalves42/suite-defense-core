#!/usr/bin/env bash
#
# CyberShield Agent - Secure Requests & Network Watchdog
#

invoke_secure_request() {
    local method="$1"
    local path="$2"
    local body="${3:-}"
    local timeout="${4:-30}"
    local max_retries="${5:-5}"

    local url
    if [[ "$path" == http* ]]; then url="$path"; else url="${SERVER_URL}${path}"; fi

    local retry_count=0
    local base_delay=1
    local max_delay=60

    while [[ $retry_count -lt $max_retries ]]; do
        local headers=(
            -H "User-Agent: CyberShield-Agent/$AGENT_VERSION"
            -H "X-Agent-Token: $AGENT_TOKEN"
            -H "X-Agent-Name: $AGENT_NAME"
        )

        if [[ -n "$HMAC_SECRET" ]]; then
            local timestamp nonce signature_payload signature
            timestamp=$(date +%s)
            nonce=$(_generate_uuid)
            signature_payload="${timestamp}.${nonce}.${body:-}"
            signature=$(echo -n "$signature_payload" | openssl dgst -sha256 -hmac "$HMAC_SECRET" | awk '{print $2}')
            headers+=(
                -H "X-HMAC-Signature: $signature"
                -H "X-HMAC-Timestamp: $timestamp"
                -H "X-HMAC-Nonce: $nonce"
            )
        fi

        local result http_code
        if [[ "$method" == "GET" ]]; then
            result=$(curl -s -w "\n%{http_code}" --tlsv1.2 --connect-timeout 10 --max-time "$timeout" "${headers[@]}" "$url" 2>/dev/null) || true
        else
            result=$(curl -s -w "\n%{http_code}" --tlsv1.2 --connect-timeout 10 --max-time "$timeout" -X "$method" -H "Content-Type: application/json" "${headers[@]}" -d "$body" "$url" 2>/dev/null) || true
        fi

        http_code=$(echo "$result" | tail -n1)
        local response_body
        response_body=$(echo "$result" | sed '$d')

        if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
            echo "$response_body"
            return 0
        fi

        retry_count=$((retry_count + 1))
        if [[ "$http_code" =~ ^(502|503|504|429|000)$ && $retry_count -lt $max_retries ]]; then
            local delay=$((base_delay * (2 ** (retry_count - 1))))
            [[ $delay -gt $max_delay ]] && delay=$max_delay
            log "WARN" "[NETWORK] Request failed (attempt $retry_count/$max_retries), retrying in ${delay}s (HTTP: $http_code)"
            sleep "$delay"
        else
            log "ERROR" "[NETWORK] Request failed permanently (HTTP: $http_code)"
            return 1
        fi
    done
    return 1
}

test_network_connectivity() {
    nc -z -w5 "$NETWORK_TEST_HOST" "$NETWORK_TEST_PORT" 2>/dev/null
}
