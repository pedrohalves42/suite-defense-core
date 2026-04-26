
-- Função de auditoria de rotação de credenciais
CREATE OR REPLACE FUNCTION public.audit_credential_rotation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stale_hmac INTEGER := 0;
  v_stale_tokens INTEGER := 0;
  v_stale_keys INTEGER := 0;
  v_result JSONB;
  v_threshold INTERVAL := '90 days';
  v_agent RECORD;
BEGIN
  -- 1. Check HMAC secrets older than 90 days (agents without recent hmac_secret update)
  SELECT COUNT(*) INTO v_stale_hmac
  FROM agents a
  WHERE a.status = 'active'
    AND a.enrolled_at < NOW() - v_threshold
    AND NOT EXISTS (
      SELECT 1 FROM secret_rotation_log srl
      WHERE srl.secret_name = 'hmac_secret:' || a.id::text
        AND srl.rotated_at > NOW() - v_threshold
    );

  -- 2. Check agent tokens older than 90 days
  SELECT COUNT(*) INTO v_stale_tokens
  FROM agent_tokens at2
  JOIN agents a ON a.id = at2.agent_id
  WHERE a.status = 'active'
    AND at2.created_at < NOW() - v_threshold
    AND at2.revoked_at IS NULL;

  -- 3. Check enrollment keys older than 90 days
  SELECT COUNT(*) INTO v_stale_keys
  FROM enrollment_keys ek
  WHERE ek.is_active = true
    AND ek.created_at < NOW() - v_threshold;

  -- Log the audit result
  INSERT INTO secret_rotation_log (
    secret_name, rotated_at, rotated_by, rotation_method, status, notes, tenant_id
  ) VALUES (
    'credential_audit',
    NOW(),
    'system:rotate-audit',
    'automated_audit',
    CASE WHEN (v_stale_hmac + v_stale_tokens + v_stale_keys) = 0 THEN 'healthy' ELSE 'warning' END,
    format('Audit: %s stale HMAC secrets, %s stale tokens, %s stale enrollment keys (threshold: %s)',
      v_stale_hmac, v_stale_tokens, v_stale_keys, v_threshold),
    NULL
  );

  -- Create system alert if stale credentials found
  IF (v_stale_hmac + v_stale_tokens + v_stale_keys) > 0 THEN
    INSERT INTO system_alerts (
      alert_type, severity, title, message, metadata
    ) VALUES (
      'credential_rotation_overdue',
      'high',
      'Credenciais com rotação atrasada detectadas',
      format('%s HMAC secrets, %s tokens e %s enrollment keys sem rotação há mais de 90 dias',
        v_stale_hmac, v_stale_tokens, v_stale_keys),
      jsonb_build_object(
        'stale_hmac', v_stale_hmac,
        'stale_tokens', v_stale_tokens,
        'stale_keys', v_stale_keys,
        'threshold_days', 90
      )
    );
  END IF;

  v_result := jsonb_build_object(
    'stale_hmac', v_stale_hmac,
    'stale_tokens', v_stale_tokens,
    'stale_keys', v_stale_keys,
    'total_stale', v_stale_hmac + v_stale_tokens + v_stale_keys,
    'status', CASE WHEN (v_stale_hmac + v_stale_tokens + v_stale_keys) = 0 THEN 'healthy' ELSE 'warning' END,
    'audited_at', NOW()
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_credential_rotation() TO service_role;
