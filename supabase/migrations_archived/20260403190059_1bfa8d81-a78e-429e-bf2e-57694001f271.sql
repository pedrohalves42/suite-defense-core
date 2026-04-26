
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
  v_threshold INTERVAL := '90 days';
  v_system_tenant_id UUID;
BEGIN
  -- Get a system tenant for alerts
  SELECT id INTO v_system_tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1;

  SELECT COUNT(*) INTO v_stale_hmac
  FROM agents a
  WHERE a.status = 'active'
    AND a.enrolled_at < NOW() - v_threshold
    AND NOT EXISTS (
      SELECT 1 FROM secret_rotation_log srl
      WHERE srl.secret_name = 'hmac_secret:' || a.id::text
        AND srl.rotated_at > NOW() - v_threshold
    );

  SELECT COUNT(*) INTO v_stale_tokens
  FROM agent_tokens at2
  JOIN agents a ON a.id = at2.agent_id
  WHERE a.status = 'active'
    AND at2.is_active = true
    AND at2.created_at < NOW() - v_threshold;

  SELECT COUNT(*) INTO v_stale_keys
  FROM enrollment_keys ek
  WHERE ek.is_active = true
    AND ek.created_at < NOW() - v_threshold;

  INSERT INTO secret_rotation_log (
    secret_name, rotated_at, rotated_by, rotation_method, status, notes, tenant_id
  ) VALUES (
    'credential_audit',
    NOW(),
    'system:rotate-audit',
    'automated_audit',
    CASE WHEN (v_stale_hmac + v_stale_tokens + v_stale_keys) = 0 THEN 'healthy' ELSE 'warning' END,
    format('Audit: %s stale HMAC secrets, %s stale tokens, %s stale enrollment keys (threshold: 90 days)',
      v_stale_hmac, v_stale_tokens, v_stale_keys),
    v_system_tenant_id
  );

  IF (v_stale_hmac + v_stale_tokens + v_stale_keys) > 0 AND v_system_tenant_id IS NOT NULL THEN
    INSERT INTO system_alerts (
      tenant_id, alert_type, severity, title, message, details, source
    ) VALUES (
      v_system_tenant_id,
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
      ),
      'rotate-audit'
    );
  END IF;

  RETURN jsonb_build_object(
    'stale_hmac', v_stale_hmac,
    'stale_tokens', v_stale_tokens,
    'stale_keys', v_stale_keys,
    'total_stale', v_stale_hmac + v_stale_tokens + v_stale_keys,
    'status', CASE WHEN (v_stale_hmac + v_stale_tokens + v_stale_keys) = 0 THEN 'healthy' ELSE 'warning' END,
    'audited_at', NOW()
  );
END;
$$;
