-- Fix revoke_agent_signing_key to use extensions.digest() instead of digest()
CREATE OR REPLACE FUNCTION public.revoke_agent_signing_key(p_agent_id uuid, p_reason text DEFAULT 'manual_revocation')
RETURNS jsonb AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_tenant_id uuid;
  v_agent_name text;
  v_old_hmac_hash text;
BEGIN
  SELECT tenant_id, name, encode(extensions.digest(hmac_secret::bytea, 'sha256'), 'hex')
  INTO v_tenant_id, v_agent_name, v_old_hmac_hash
  FROM agents
  WHERE id = p_agent_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'AGENT_NOT_FOUND', 'message', 'Agent does not exist');
  END IF;
  
  v_caller_tenant_id := get_active_tenant_id();
  
  IF v_caller_tenant_id IS NULL AND NOT is_current_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_TENANT_CONTEXT', 'message', 'No active tenant context');
  END IF;
  
  IF v_tenant_id != v_caller_tenant_id AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (event_type, severity, user_id, tenant_id, details, ip_address)
    VALUES ('CROSS_TENANT_ACCESS_ATTEMPT', 'critical', auth.uid(), v_caller_tenant_id,
      jsonb_build_object('function', 'revoke_agent_signing_key', 'target_agent_id', p_agent_id, 'target_tenant_id', v_tenant_id, 'caller_tenant_id', v_caller_tenant_id),
      '0.0.0.0'::inet);
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH', 'message', 'Access denied: agent belongs to different tenant');
  END IF;
  
  UPDATE agents SET hmac_secret = encode(gen_random_bytes(32), 'hex'), updated_at = now() WHERE id = p_agent_id;
  
  INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details)
  VALUES (v_tenant_id, auth.uid(), 'SIGNING_KEY_REVOKED', 'agent', p_agent_id,
    jsonb_build_object('agent_name', v_agent_name, 'reason', p_reason, 'old_key_hash_prefix', left(v_old_hmac_hash, 8)));
  
  RETURN jsonb_build_object('success', true, 'agent_id', p_agent_id, 'agent_name', v_agent_name, 'action', 'signing_key_revoked', 'note', 'Agent must re-enroll to communicate with server');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;