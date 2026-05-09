-- Create the missing tenant_security_policies table
CREATE TABLE IF NOT EXISTS public.tenant_security_policies (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
    token_expiry_days INTEGER DEFAULT 365,
    max_clock_skew_seconds INTEGER DEFAULT 300,
    enforce_hmac_enrollment BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tenant_security_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own tenant security policies" ON public.tenant_security_policies FOR SELECT USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE tenant_id = tenant_security_policies.tenant_id));
CREATE POLICY "Admins can update their own tenant security policies" ON public.tenant_security_policies FOR UPDATE USING (auth.uid() IN (SELECT user_id FROM user_roles WHERE tenant_id = tenant_security_policies.tenant_id AND role IN ('admin', 'super_admin')));

-- Create agent locks table to prevent hijacking
CREATE TABLE IF NOT EXISTS public.agent_registration_locks (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    locked_by_agent_id UUID,
    PRIMARY KEY (tenant_id, agent_name)
);

-- Enable RLS on locks
ALTER TABLE public.agent_registration_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only access to registration locks" ON public.agent_registration_locks FOR ALL USING (true) WITH CHECK (true);

-- Harden enroll_agent_atomic (Refined with actual schema names)
CREATE OR REPLACE FUNCTION public.enroll_agent_atomic(
    p_key_hash TEXT,
    p_agent_name TEXT,
    p_hmac_secret TEXT,
    p_token_hash TEXT,
    p_token_prefix TEXT,
    p_expires_at TIMESTAMP WITH TIME ZONE,
    p_metadata_hash TEXT DEFAULT NULL
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
    v_is_locked BOOLEAN;
    v_existing_agent_id UUID;
    v_tenant_id UUID;
BEGIN
    -- 1. Buscar chave pelo hash
    SELECT id, tenant_id INTO v_key_id, v_tenant_id FROM public.enrollment_keys WHERE key_hash = p_key_hash AND is_active = true LIMIT 1;
    
    IF v_key_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_KEY');
    END IF;

    -- 2. Incrementar uso e validar quota
    v_inc_result := public.increment_enrollment_key_usage(v_key_id, p_agent_name);
    
    IF NOT (v_inc_result->>'success')::boolean THEN
        return v_inc_result;
    END IF;

    -- 3. HIJACK PROTECTION: Check if agent is locked
    SELECT id INTO v_existing_agent_id FROM public.agents 
    WHERE tenant_id = v_tenant_id AND agent_name = p_agent_name;

    IF v_existing_agent_id IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM public.agent_registration_locks WHERE tenant_id = v_tenant_id AND agent_name = p_agent_name)
        INTO v_is_locked;
        
        -- If locked, only allow if the agent hasn't been seen in 30 days
        IF v_is_locked THEN
             IF EXISTS (SELECT 1 FROM public.agents WHERE id = v_existing_agent_id AND (last_heartbeat > (NOW() - INTERVAL '30 days') OR updated_at > (NOW() - INTERVAL '30 days'))) THEN
                RETURN jsonb_build_object('success', false, 'error', 'AGENT_LOCKED', 'message', 'This agent name is locked. Contact admin for re-enrollment.');
             END IF;
        END IF;
    END IF;

    -- 4. Criar ou Reativar Agente
    INSERT INTO public.agents (tenant_id, agent_name, hmac_secret, status, agent_state)
    VALUES (
        v_tenant_id, 
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
        updated_at = NOW()
    RETURNING id INTO v_agent_id;

    -- 5. Auto-lock on first enrollment
    INSERT INTO public.agent_registration_locks (tenant_id, agent_name, locked_by_agent_id)
    VALUES (v_tenant_id, p_agent_name, v_agent_id)
    ON CONFLICT (tenant_id, agent_name) DO NOTHING;

    -- 6. Inativar tokens antigos e inserir novo
    UPDATE public.agent_tokens SET is_active = false WHERE agent_id = v_agent_id;
    
    INSERT INTO public.agent_tokens (agent_id, tenant_id, token_hash, token_prefix, expires_at, is_active)
    VALUES (
        v_agent_id, 
        v_tenant_id, 
        p_token_hash, 
        p_token_prefix, 
        p_expires_at,
        true
    );

    RETURN jsonb_build_object(
        'success', true,
        'agent_id', v_agent_id,
        'tenant_id', v_tenant_id
    );
END;
$$;
