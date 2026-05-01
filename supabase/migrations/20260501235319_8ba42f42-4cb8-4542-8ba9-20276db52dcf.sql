-- 1. Normalizar identificadores na função de Rate Limit
CREATE OR REPLACE FUNCTION public.check_rate_limit_atomic(p_identifier text, p_endpoint text, p_max_requests integer DEFAULT 60, p_window_minutes integer DEFAULT 1, p_block_minutes integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_now timestamptz := now();
    v_window_start timestamptz := v_now - (p_window_minutes || ' minutes')::interval;
    v_norm_identifier text := lower(trim(p_identifier));
    v_row record;
    v_new_count integer;
BEGIN
    -- Check if blocked
    SELECT * INTO v_row
    FROM rate_limits
    WHERE identifier = v_norm_identifier AND endpoint = p_endpoint;

    IF FOUND AND v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'blocked',
            'reset_at', v_row.blocked_until
        );
    END IF;

    -- Window expired or no row: reset
    IF NOT FOUND OR v_row.window_start < v_window_start THEN
        INSERT INTO rate_limits (identifier, endpoint, request_count, window_start, last_request_at, blocked_until)
        VALUES (v_norm_identifier, p_endpoint, 1, v_now, v_now, NULL)
        ON CONFLICT (identifier, endpoint)
        DO UPDATE SET
            request_count = 1,
            window_start = v_now,
            last_request_at = v_now,
            blocked_until = NULL;

        RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - 1);
    END IF;

    -- Increment
    v_new_count := v_row.request_count + 1;

    IF v_new_count > p_max_requests THEN
        -- Block
        UPDATE rate_limits SET
            request_count = v_new_count,
            last_request_at = v_now,
            blocked_until = v_now + (p_block_minutes || ' minutes')::interval
        WHERE identifier = v_norm_identifier AND endpoint = p_endpoint;

        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'rate_exceeded',
            'reset_at', v_now + (p_block_minutes || ' minutes')::interval
        );
    END IF;

    UPDATE rate_limits SET
        request_count = v_new_count,
        last_request_at = v_now
    WHERE identifier = v_norm_identifier AND endpoint = p_endpoint;

    RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - v_new_count);
END;
$function$;
