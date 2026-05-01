-- 1. Hardening global de SECURITY DEFINER com search_path completo
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    FOR r IN (
        SELECT proname, nspname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE p.prosecdef = true 
        AND n.nspname = 'public'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_catalog, pg_temp', r.proname, r.args);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not alter function %: %', r.proname, SQLERRM;
        END;
    END LOOP;
END $$;

-- 2. Função RPC para Incremento Atômico de Uso de Chave de Enrollment
CREATE OR REPLACE FUNCTION public.increment_enrollment_key_usage(p_key_id UUID, p_agent_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_key_data RECORD;
    v_new_expiration TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Seleciona e trava a linha para update
    SELECT * INTO v_key_data 
    FROM public.enrollment_keys 
    WHERE id = p_key_id AND is_active = true 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Key not found or inactive');
    END IF;

    -- Verifica limites
    IF v_key_data.max_uses IS NOT NULL AND v_key_data.current_uses >= v_key_data.max_uses THEN
        RETURN jsonb_build_object('success', false, 'error', 'Max uses exceeded');
    END IF;

    IF v_key_data.expires_at IS NOT NULL AND v_key_data.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Key expired');
    END IF;

    -- Calcula nova expiração se for o primeiro uso
    v_new_expiration := v_key_data.expires_at;
    IF v_key_data.current_uses = 0 THEN
        v_new_expiration := NOW() + INTERVAL '1 year';
    END IF;

    -- Update atômico
    UPDATE public.enrollment_keys
    SET 
        current_uses = current_uses + 1,
        used_by_agent = p_agent_name,
        used_at = NOW(),
        expires_at = v_new_expiration
    WHERE id = p_key_id;

    RETURN jsonb_build_object('success', true, 'current_uses', v_key_data.current_uses + 1);
END;
$$;

-- 3. Garantir que agentes aposentados não apareçam em listagens padrão
-- Adiciona um índice parcial para performance em buscas de agentes ativos
CREATE INDEX IF NOT EXISTS idx_agents_active_tenant ON public.agents (tenant_id, status) 
WHERE status NOT IN ('retired', 'blocked');

-- 4. Reforçar RLS de enrollment_keys para garantir isolamento total
ALTER TABLE public.enrollment_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_enrollment_keys" ON public.enrollment_keys;
CREATE POLICY "tenant_isolation_enrollment_keys" 
ON public.enrollment_keys 
FOR ALL
TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());
