-- 1. Atualizar função de incremento para ser mais robusta e validar quota
CREATE OR REPLACE FUNCTION public.increment_enrollment_key_usage(p_key_id UUID, p_agent_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_key_data RECORD;
    v_tenant_id UUID;
    v_max_agents INTEGER;
    v_current_agents INTEGER;
    v_new_expiration TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Seleciona e trava a chave
    SELECT * INTO v_key_data 
    FROM public.enrollment_keys 
    WHERE id = p_key_id AND is_active = true 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'KEY_NOT_FOUND');
    END IF;

    v_tenant_id := v_key_data.tenant_id;

    -- Verifica expiração
    IF v_key_data.expires_at IS NOT NULL AND v_key_data.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'KEY_EXPIRED');
    END IF;

    -- Verifica uso máximo da chave
    IF v_key_data.max_uses IS NOT NULL AND v_key_data.current_uses >= v_key_data.max_uses THEN
        RETURN jsonb_build_object('success', false, 'error', 'KEY_USAGE_EXCEEDED');
    END IF;

    -- VERIFICAÇÃO DE QUOTA (ATÔMICA)
    -- Só verifica quota se o agente for novo (não existe na tabela agents para este tenant)
    IF NOT EXISTS (SELECT 1 FROM public.agents WHERE tenant_id = v_tenant_id AND agent_name = p_agent_name) THEN
        -- Tenta pegar limite do tenant (ex: de uma tabela de configurações ou plano)
        -- Fallback para 100 se não configurado
        SELECT COALESCE((settings->>'max_agents')::int, 100) INTO v_max_agents 
        FROM public.tenants WHERE id = v_tenant_id;
        
        SELECT COUNT(*) INTO v_current_agents FROM public.agents WHERE tenant_id = v_tenant_id;
        
        IF v_current_agents >= v_max_agents THEN
            RETURN jsonb_build_object('success', false, 'error', 'QUOTA_EXCEEDED', 'limit', v_max_agents, 'current', v_current_agents);
        END IF;
    END IF;

    -- Calcula nova expiração se for primeiro uso
    v_new_expiration := v_key_data.expires_at;
    IF v_key_data.current_uses = 0 THEN
        v_new_expiration := NOW() + INTERVAL '1 year';
    END IF;

    -- Update atômico da chave
    UPDATE public.enrollment_keys
    SET 
        current_uses = current_uses + 1,
        used_by_agent = p_agent_name,
        used_at = NOW(),
        expires_at = v_new_expiration
    WHERE id = p_key_id;

    RETURN jsonb_build_object(
        'success', true, 
        'tenant_id', v_tenant_id, 
        'key_id', v_key_data.id,
        'current_uses', v_key_data.current_uses + 1
    );
END;
$$;

-- 2. Criar função atômica de Enrollment Completo
-- Resolve RACE CONDITION entre criação de agente e token
CREATE OR REPLACE FUNCTION public.enroll_agent_atomic(
    p_key_hash TEXT,
    p_agent_name TEXT,
    p_hmac_secret TEXT,
    p_token_hash TEXT,
    p_token_prefix TEXT,
    p_expires_at TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_key_id UUID;
    v_inc_result JSONB;
    v_agent_id UUID;
BEGIN
    -- 1. Buscar chave pelo hash
    SELECT id INTO v_key_id FROM public.enrollment_keys WHERE key_hash = p_key_hash AND is_active = true LIMIT 1;
    
    IF v_key_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_KEY');
    END IF;

    -- 2. Incrementar uso e validar quota (Atômico via função anterior)
    v_inc_result := public.increment_enrollment_key_usage(v_key_id, p_agent_name);
    
    IF NOT (v_inc_result->>'success')::boolean THEN
        return v_inc_result;
    END IF;

    -- 3. Criar ou Reativar Agente
    INSERT INTO public.agents (tenant_id, agent_name, hmac_secret, status, agent_state)
    VALUES (
        (v_inc_result->>'tenant_id')::uuid, 
        p_agent_name, 
        p_hmac_secret, 
        'active', 
        'healthy'
    )
    ON CONFLICT (tenant_id, agent_name) 
    DO UPDATE SET 
        hmac_secret = EXCLUDED.hmac_secret,
        status = 'active',
        agent_state = 'healthy',
        last_heartbeat = NULL -- Reset heartbeat for new session
    RETURNING id INTO v_agent_id;

    -- 4. Inativar tokens antigos e inserir novo
    UPDATE public.agent_tokens SET is_active = false WHERE agent_id = v_agent_id;
    
    INSERT INTO public.agent_tokens (agent_id, tenant_id, token_hash, token_prefix, expires_at, is_active)
    VALUES (
        v_agent_id, 
        (v_inc_result->>'tenant_id')::uuid, 
        p_token_hash, 
        p_token_prefix, 
        p_expires_at,
        true
    );

    RETURN jsonb_build_object(
        'success', true,
        'agent_id', v_agent_id,
        'tenant_id', v_inc_result->>'tenant_id'
    );
END;
$$;

-- 3. Índices extras para performance
CREATE INDEX IF NOT EXISTS idx_agent_tokens_active_prefix ON public.agent_tokens (token_prefix) WHERE is_active = true;
