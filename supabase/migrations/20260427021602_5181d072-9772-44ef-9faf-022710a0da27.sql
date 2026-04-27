-- Trigger para auditar tentativas de escrita em tabelas críticas
CREATE OR REPLACE FUNCTION public.audit_sensitive_access_attempt()
RETURNS TRIGGER AS $$
BEGIN
    IF (auth.role() = 'anon' OR auth.role() = 'authenticated') AND NOT public.has_role(auth.uid(), 'admin') THEN
        PERFORM public.log_security_event(
            'UNAUTHORIZED_TABLE_WRITE',
            'HIGH',
            current_setting('request.headers', true)::jsonb->>'x-real-ip',
            jsonb_build_object('table', TG_TABLE_NAME, 'role', auth.role(), 'op', TG_OP),
            NULL
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auditar tentativas na tabela de chaves de assinatura
DROP TRIGGER IF EXISTS audit_agent_hmac_signatures_access ON public.agent_hmac_signatures;
CREATE TRIGGER audit_agent_hmac_signatures_access
BEFORE INSERT OR UPDATE OR DELETE ON public.agent_hmac_signatures
FOR EACH ROW EXECUTE FUNCTION public.audit_sensitive_access_attempt();

-- Atualizar hmac_check_and_record com logs estruturados
CREATE OR REPLACE FUNCTION public.hmac_check_and_record(
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
        PERFORM public.log_security_event('HMAC_FAILURE', 'CRITICAL', NULL, jsonb_build_object('agent_id', p_agent_id, 'reason', 'secret_not_found'));
        RETURN FALSE;
    END IF;

    -- pgcrypto extension is required
    v_expected_sig := encode(hmac(p_payload::text || p_timestamp, v_secret, 'sha256'), 'hex');
    v_is_valid := (v_signature = v_expected_sig);

    IF NOT v_is_valid THEN
        PERFORM public.log_security_event('HMAC_FAILURE', 'HIGH', NULL, jsonb_build_object('agent_id', p_agent_id, 'reason', 'signature_mismatch'));
    END IF;

    RETURN v_is_valid;
END;
$$;
