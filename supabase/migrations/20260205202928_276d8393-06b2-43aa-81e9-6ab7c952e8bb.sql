-- ============================================================
-- SECURITY REMEDIATION: V-002 (Retry with DROP)
-- Auditor: Dr. Isaac K. Vellum
-- ============================================================

-- First drop the existing function
DROP FUNCTION IF EXISTS public.revoke_agent_signing_key(uuid, text);

-- V-002: FIX revoke_agent_signing_key - Add tenant validation
CREATE OR REPLACE FUNCTION public.revoke_agent_signing_key(
  p_agent_id uuid,
  p_reason text DEFAULT 'Manual revocation by administrator'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_tenant_id uuid;
  v_agent_name text;
  v_old_hmac_hash text;
BEGIN
  -- Get agent's tenant_id and current hmac info
  SELECT tenant_id, name, encode(digest(hmac_secret, 'sha256'), 'hex')
  INTO v_tenant_id, v_agent_name, v_old_hmac_hash
  FROM agents
  WHERE id = p_agent_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'AGENT_NOT_FOUND',
      'message', 'Agent does not exist'
    );
  END IF;
  
  -- V-002 FIX: Validate caller has access to this tenant
  v_caller_tenant_id := get_active_tenant_id();
  
  IF v_caller_tenant_id IS NULL AND NOT is_current_super_admin() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NO_TENANT_CONTEXT',
      'message', 'No active tenant context'
    );
  END IF;
  
  IF v_tenant_id != v_caller_tenant_id AND NOT is_current_super_admin() THEN
    -- Log potential cross-tenant attack attempt
    INSERT INTO security_logs (
      event_type,
      severity,
      user_id,
      tenant_id,
      details,
      ip_address
    ) VALUES (
      'CROSS_TENANT_ACCESS_ATTEMPT',
      'critical',
      auth.uid(),
      v_caller_tenant_id,
      jsonb_build_object(
        'function', 'revoke_agent_signing_key',
        'target_agent_id', p_agent_id,
        'target_tenant_id', v_tenant_id,
        'caller_tenant_id', v_caller_tenant_id
      ),
      '0.0.0.0'::inet
    );
    
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TENANT_MISMATCH',
      'message', 'Access denied: agent belongs to different tenant'
    );
  END IF;
  
  -- Generate new HMAC secret (effectively revoking the old one)
  UPDATE agents
  SET 
    hmac_secret = encode(gen_random_bytes(32), 'hex'),
    updated_at = now()
  WHERE id = p_agent_id;
  
  -- Log the revocation
  INSERT INTO audit_logs (
    tenant_id,
    user_id,
    action,
    resource_type,
    resource_id,
    details
  ) VALUES (
    v_tenant_id,
    auth.uid(),
    'SIGNING_KEY_REVOKED',
    'agent',
    p_agent_id,
    jsonb_build_object(
      'agent_name', v_agent_name,
      'reason', p_reason,
      'old_key_hash_prefix', left(v_old_hmac_hash, 8)
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'agent_name', v_agent_name,
    'action', 'signing_key_revoked',
    'note', 'Agent must re-enroll to communicate with server'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.revoke_agent_signing_key(uuid, text) TO authenticated;

-- Add comment for compliance documentation
COMMENT ON FUNCTION public.revoke_agent_signing_key IS 'Revokes agent signing keys with V-002 tenant validation fix. SOC2/ISO27001 compliant.';