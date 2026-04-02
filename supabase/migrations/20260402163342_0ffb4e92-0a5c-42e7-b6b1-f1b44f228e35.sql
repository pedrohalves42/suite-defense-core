-- =============================================================================
-- PHASE 1: Hash chain on security_logs and agent_evidence_logs
-- =============================================================================

-- 1A. Add hash chain columns to security_logs
ALTER TABLE public.security_logs
  ADD COLUMN IF NOT EXISTS integrity_hash TEXT,
  ADD COLUMN IF NOT EXISTS previous_log_hash TEXT;

-- 1B. Add hash chain columns to agent_evidence_logs
ALTER TABLE public.agent_evidence_logs
  ADD COLUMN IF NOT EXISTS integrity_hash TEXT,
  ADD COLUMN IF NOT EXISTS previous_log_hash TEXT;

-- 1C. Indexes for chain verification performance
CREATE INDEX IF NOT EXISTS idx_security_logs_integrity_hash
  ON public.security_logs (tenant_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_evidence_logs_integrity_hash
  ON public.agent_evidence_logs (tenant_id, created_at ASC);

-- 1D. Add missing service_role INSERT policy on security_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'security_logs'
      AND policyname = 'security_logs_insert_service_role'
  ) THEN
    CREATE POLICY security_logs_insert_service_role ON public.security_logs
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 2. Hash chain trigger for security_logs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.calculate_security_log_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_hash TEXT;
BEGIN
  SELECT integrity_hash INTO v_previous_hash
  FROM security_logs
  WHERE tenant_id = NEW.tenant_id
    AND id != NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  NEW.previous_log_hash := v_previous_hash;

  NEW.integrity_hash := encode(sha256(
    convert_to(
      COALESCE(v_previous_hash, 'genesis') ||
      NEW.id::text ||
      COALESCE(NEW.attack_type, '') ||
      COALESCE(NEW.endpoint, '') ||
      COALESCE(NEW.severity, '') ||
      COALESCE(NEW.ip_address, '') ||
      COALESCE(NEW.details::text, '{}') ||
      COALESCE(NEW.created_at::text, ''),
      'UTF8'
    )
  ), 'hex');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_security_log_integrity ON public.security_logs;
CREATE TRIGGER trg_security_log_integrity
  BEFORE INSERT ON public.security_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_security_log_hash();

-- =============================================================================
-- 3. Hash chain trigger for agent_evidence_logs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.calculate_evidence_log_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_hash TEXT;
BEGIN
  SELECT integrity_hash INTO v_previous_hash
  FROM agent_evidence_logs
  WHERE tenant_id = NEW.tenant_id
    AND id != NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  NEW.previous_log_hash := v_previous_hash;

  NEW.integrity_hash := encode(sha256(
    convert_to(
      COALESCE(v_previous_hash, 'genesis') ||
      NEW.id::text ||
      COALESCE(NEW.event_type, '') ||
      COALESCE(NEW.agent_name, '') ||
      COALESCE(NEW.agent_version, '') ||
      COALESCE(NEW.event_data::text, '{}') ||
      COALESCE(NEW.severity, '') ||
      COALESCE(NEW.state_before, '') ||
      COALESCE(NEW.state_after, '') ||
      COALESCE(NEW.created_at::text, ''),
      'UTF8'
    )
  ), 'hex');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evidence_log_integrity ON public.agent_evidence_logs;
CREATE TRIGGER trg_evidence_log_integrity
  BEFORE INSERT ON public.agent_evidence_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_evidence_log_hash();

-- =============================================================================
-- 4. Verify function for security_logs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_security_log_chain(
  p_tenant_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE(
  total_records BIGINT,
  chain_valid BOOLEAN,
  broken_at TIMESTAMP WITH TIME ZONE,
  broken_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_previous_hash TEXT := NULL;
  v_total BIGINT := 0;
  v_broken_at TIMESTAMP WITH TIME ZONE := NULL;
  v_broken_id UUID := NULL;
  v_chain_valid BOOLEAN := true;
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);

  FOR v_log IN
    SELECT sl.id, sl.integrity_hash, sl.previous_log_hash, sl.created_at
    FROM security_logs sl
    WHERE sl.tenant_id = p_tenant_id
      AND (p_start_date IS NULL OR sl.created_at >= p_start_date)
      AND (p_end_date IS NULL OR sl.created_at <= p_end_date)
    ORDER BY sl.created_at ASC, sl.id ASC
  LOOP
    v_total := v_total + 1;

    IF v_previous_hash IS NOT NULL THEN
      IF v_log.previous_log_hash IS DISTINCT FROM v_previous_hash THEN
        v_chain_valid := false;
        v_broken_at := v_log.created_at;
        v_broken_id := v_log.id;
        EXIT;
      END IF;
    END IF;

    v_previous_hash := v_log.integrity_hash;
  END LOOP;

  RETURN QUERY SELECT v_total, v_chain_valid, v_broken_at, v_broken_id;
END;
$$;

-- =============================================================================
-- 5. Verify function for agent_evidence_logs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_evidence_log_chain(
  p_tenant_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE(
  total_records BIGINT,
  chain_valid BOOLEAN,
  broken_at TIMESTAMP WITH TIME ZONE,
  broken_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_previous_hash TEXT := NULL;
  v_total BIGINT := 0;
  v_broken_at TIMESTAMP WITH TIME ZONE := NULL;
  v_broken_id UUID := NULL;
  v_chain_valid BOOLEAN := true;
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);

  FOR v_log IN
    SELECT el.id, el.integrity_hash, el.previous_log_hash, el.created_at
    FROM agent_evidence_logs el
    WHERE el.tenant_id = p_tenant_id
      AND (p_start_date IS NULL OR el.created_at >= p_start_date)
      AND (p_end_date IS NULL OR el.created_at <= p_end_date)
    ORDER BY el.created_at ASC, el.id ASC
  LOOP
    v_total := v_total + 1;

    IF v_previous_hash IS NOT NULL THEN
      IF v_log.previous_log_hash IS DISTINCT FROM v_previous_hash THEN
        v_chain_valid := false;
        v_broken_at := v_log.created_at;
        v_broken_id := v_log.id;
        EXIT;
      END IF;
    END IF;

    v_previous_hash := v_log.integrity_hash;
  END LOOP;

  RETURN QUERY SELECT v_total, v_chain_valid, v_broken_at, v_broken_id;
END;
$$;

-- =============================================================================
-- 6. Integrity sentinel — runs via pg_cron, checks all chains, creates alerts
-- =============================================================================
CREATE OR REPLACE FUNCTION public.run_integrity_sentinel()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_result RECORD;
  v_alerts_created INT := 0;
  v_tenants_checked INT := 0;
  v_window_start TIMESTAMP WITH TIME ZONE := NOW() - INTERVAL '24 hours';
BEGIN
  FOR v_tenant IN
    SELECT id FROM tenants
  LOOP
    v_tenants_checked := v_tenants_checked + 1;

    -- Check audit_logs chain
    SELECT * INTO v_result
    FROM verify_audit_log_chain(v_tenant.id, v_window_start, NOW());

    IF v_result IS NOT NULL AND NOT v_result.chain_valid THEN
      INSERT INTO system_alerts (
        tenant_id, alert_type, severity, title, message, metadata
      ) VALUES (
        v_tenant.id,
        'integrity_violation',
        'critical',
        'Audit log chain broken',
        format('Hash chain break detected at %s (log id: %s)', v_result.broken_at, v_result.broken_id),
        jsonb_build_object('table', 'audit_logs', 'broken_at', v_result.broken_at, 'broken_id', v_result.broken_id)
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;

    -- Check security_logs chain
    SELECT * INTO v_result
    FROM verify_security_log_chain(v_tenant.id, v_window_start, NOW());

    IF v_result IS NOT NULL AND NOT v_result.chain_valid THEN
      INSERT INTO system_alerts (
        tenant_id, alert_type, severity, title, message, metadata
      ) VALUES (
        v_tenant.id,
        'integrity_violation',
        'critical',
        'Security log chain broken',
        format('Hash chain break detected at %s (log id: %s)', v_result.broken_at, v_result.broken_id),
        jsonb_build_object('table', 'security_logs', 'broken_at', v_result.broken_at, 'broken_id', v_result.broken_id)
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;

    -- Check evidence_logs chain
    SELECT * INTO v_result
    FROM verify_evidence_log_chain(v_tenant.id, v_window_start, NOW());

    IF v_result IS NOT NULL AND NOT v_result.chain_valid THEN
      INSERT INTO system_alerts (
        tenant_id, alert_type, severity, title, message, metadata
      ) VALUES (
        v_tenant.id,
        'integrity_violation',
        'critical',
        'Evidence log chain broken',
        format('Hash chain break detected at %s (log id: %s)', v_result.broken_at, v_result.broken_id),
        jsonb_build_object('table', 'agent_evidence_logs', 'broken_at', v_result.broken_at, 'broken_id', v_result.broken_id)
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tenants_checked', v_tenants_checked,
    'alerts_created', v_alerts_created,
    'checked_at', NOW()
  );
END;
$$;

-- Grant execute to authenticated for verify functions
GRANT EXECUTE ON FUNCTION public.verify_security_log_chain(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_evidence_log_chain(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_integrity_sentinel() TO service_role;