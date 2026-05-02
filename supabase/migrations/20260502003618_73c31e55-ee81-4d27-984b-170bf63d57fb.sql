-- 1. Restaura a função de replay protection esperada pelo Edge Function hmac.ts
CREATE OR REPLACE FUNCTION public.hmac_check_and_record(
    p_signature TEXT,
    p_agent_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted BOOLEAN;
BEGIN
    -- V-14005: Atomic check and record for replay protection
    INSERT INTO public.agent_hmac_signatures (signature, agent_name, created_at)
    VALUES (p_signature, p_agent_name, now())
    ON CONFLICT (signature) DO NOTHING;
    
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    
    -- Retorna true se foi inserido (nova assinatura), false se já existia (replay)
    RETURN v_inserted > 0;
END;
$$;

-- 2. Torna check_rate_limit_atomic verdadeiramente atômica
CREATE OR REPLACE FUNCTION public.check_rate_limit_atomic(
    p_identifier TEXT,
    p_endpoint TEXT,
    p_max_requests INTEGER DEFAULT 60,
    p_window_minutes INTEGER DEFAULT 1,
    p_block_minutes INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_window_start TIMESTAMPTZ := v_now - (p_window_minutes || ' minutes')::interval;
    v_row RECORD;
    v_new_count INTEGER;
BEGIN
    -- V-14006: Use FOR UPDATE to lock the row and ensure atomicity in concurrent requests
    SELECT * INTO v_row
    FROM public.rate_limits
    WHERE identifier = p_identifier AND endpoint = p_endpoint
    FOR UPDATE;

    -- Se bloqueado, retorna imediatamente
    IF FOUND AND v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'blocked',
            'reset_at', v_row.blocked_until
        );
    END IF;

    -- Janela expirada ou novo registro: reinicia contagem
    IF NOT FOUND OR v_row.window_start < v_window_start THEN
        INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start, last_request_at, blocked_until)
        VALUES (p_identifier, p_endpoint, 1, v_now, v_now, NULL)
        ON CONFLICT (identifier, endpoint)
        DO UPDATE SET
            request_count = 1,
            window_start = v_now,
            last_request_at = v_now,
            blocked_until = NULL;

        RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - 1);
    END IF;

    -- Incrementa contagem atômica
    v_new_count := v_row.request_count + 1;

    IF v_new_count > p_max_requests THEN
        -- Bloqueia por excesso de taxa
        UPDATE public.rate_limits SET
            request_count = v_new_count,
            last_request_at = v_now,
            blocked_until = v_now + (p_block_minutes || ' minutes')::interval
        WHERE identifier = p_identifier AND endpoint = p_endpoint;

        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'rate_exceeded',
            'reset_at', v_now + (p_block_minutes || ' minutes')::interval
        );
    END IF;

    -- Atualiza contagem normal
    UPDATE public.rate_limits SET
        request_count = v_new_count,
        last_request_at = v_now
    WHERE identifier = p_identifier AND endpoint = p_endpoint;

    RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - v_new_count);
END;
$$;

-- 3. Otimização de performance para busca de rate limit
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_endpoint 
ON public.rate_limits (identifier, endpoint);

-- 4. Mantém a versão de validação com nome distinto caso outros sistemas dependam dela
CREATE OR REPLACE FUNCTION public.hmac_verify_signature_v2(
    p_agent_id UUID,
    p_signature TEXT,
    p_payload JSONB,
    p_timestamp TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret TEXT;
    v_expected_sig TEXT;
    v_is_valid BOOLEAN;
BEGIN
    SELECT secret_key INTO v_secret FROM public.agent_hmac_signatures WHERE agent_id = p_agent_id;
    
    IF v_secret IS NULL THEN
        RETURN FALSE;
    END IF;

    v_expected_sig := encode(hmac(p_payload::text || p_timestamp, v_secret, 'sha256'), 'hex');
    v_is_valid := (v_signature = v_expected_sig);

    RETURN v_is_valid;
END;
$$;