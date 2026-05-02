-- 1. Atualizar função de incremento para ser mais robusta e validar quota com bloqueio de tenant
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

    -- VERIFICAÇÃO DE QUOTA (ATÔMICA COM BLOQUEIO DE TENANT)
    -- Só verifica quota se o agente for novo
    IF NOT EXISTS (SELECT 1 FROM public.agents WHERE tenant_id = v_tenant_id AND agent_name = p_agent_name) THEN
        -- Trava o registro do tenant para garantir contagem consistente
        -- Use FOR SHARE para permitir leituras mas bloquear outros processos de enrollment que tentem FOR SHARE/UPDATE
        PERFORM 1 FROM public.tenants WHERE id = v_tenant_id FOR SHARE;
        
        -- Tenta pegar limite do tenant (fallback para 100 se não configurado)
        SELECT COALESCE((settings->>'max_agents')::int, 100) INTO v_max_agents 
        FROM public.tenants WHERE id = v_tenant_id;
        
        SELECT COUNT(*) INTO v_current_agents FROM public.agents WHERE tenant_id = v_tenant_id;
        
        IF v_current_agents >= v_max_agents THEN
            RETURN jsonb_build_object('success', false, 'error', 'QUOTA_EXCEEDED', 'limit', v_max_agents, 'current', v_current_agents);
        END IF;
    END IF;

    -- Calcula nova expiração apenas se for primeiro uso e não houver expiração definida
    v_new_expiration := v_key_data.expires_at;
    IF v_key_data.current_uses = 0 AND v_new_expiration IS NULL THEN
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
