
-- ================================================================
-- FIX 1: Corrigir trigger calculate_audit_log_hash
-- ================================================================
CREATE OR REPLACE FUNCTION public.calculate_audit_log_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_hash TEXT;
BEGIN
  SELECT integrity_hash INTO v_previous_hash
  FROM audit_logs
  WHERE tenant_id = NEW.tenant_id
    AND id != NEW.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;
  
  NEW.previous_log_hash := COALESCE(v_previous_hash, 'GENESIS');
  
  NEW.integrity_hash := encode(sha256(
    convert_to(
      COALESCE(NEW.previous_log_hash, 'GENESIS') || 
      NEW.id::text || 
      COALESCE(NEW.action, '') || 
      COALESCE(NEW.resource_type, '') ||
      COALESCE(NEW.resource_id, '') ||
      COALESCE(NEW.state_before::text, '{}') ||
      COALESCE(NEW.state_after::text, '{}') ||
      COALESCE(NEW.created_at::text, ''),
      'UTF8'
    )
  ), 'hex');
  
  RETURN NEW;
END;
$$;

-- ================================================================
-- FIX 2: DROP + recreate backfill with correct return type order
-- ================================================================
DROP FUNCTION IF EXISTS public.backfill_audit_log_hashes(UUID);

CREATE FUNCTION public.backfill_audit_log_hashes(p_tenant_id UUID DEFAULT NULL)
RETURNS TABLE(updated_count INTEGER, tenant_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_previous_hash TEXT := 'GENESIS';
  v_count INTEGER := 0;
  v_current_tenant UUID;
  v_new_integrity TEXT;
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can backfill audit log hashes (SSA-SEC-008)';
  END IF;

  ALTER TABLE audit_logs DISABLE TRIGGER tr_prevent_audit_modification;
  ALTER TABLE audit_logs DISABLE TRIGGER trg_immutable_audit_logs;

  BEGIN
    FOR v_current_tenant IN 
      SELECT DISTINCT al.tenant_id 
      FROM audit_logs al 
      WHERE (p_tenant_id IS NULL OR al.tenant_id = p_tenant_id)
      ORDER BY al.tenant_id
    LOOP
      v_previous_hash := 'GENESIS';
      v_count := 0;
      
      FOR v_log IN 
        SELECT al.id, al.created_at, al.action, al.resource_type, al.resource_id, al.state_before, al.state_after
        FROM audit_logs al
        WHERE al.tenant_id = v_current_tenant
        ORDER BY al.created_at ASC, al.id ASC
      LOOP
        v_new_integrity := encode(sha256(convert_to(
          v_previous_hash || 
          v_log.id::text || 
          COALESCE(v_log.action, '') || 
          COALESCE(v_log.resource_type, '') ||
          COALESCE(v_log.resource_id, '') ||
          COALESCE(v_log.state_before::text, '{}') ||
          COALESCE(v_log.state_after::text, '{}') ||
          COALESCE(v_log.created_at::text, ''),
          'UTF8'
        )), 'hex');

        UPDATE audit_logs
        SET integrity_hash = v_new_integrity, previous_log_hash = v_previous_hash
        WHERE id = v_log.id;
        
        v_previous_hash := v_new_integrity;
        v_count := v_count + 1;
      END LOOP;
      
      updated_count := v_count;
      tenant_id := v_current_tenant;
      RETURN NEXT;
    END LOOP;

    ALTER TABLE audit_logs ENABLE TRIGGER tr_prevent_audit_modification;
    ALTER TABLE audit_logs ENABLE TRIGGER trg_immutable_audit_logs;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE audit_logs ENABLE TRIGGER tr_prevent_audit_modification;
    ALTER TABLE audit_logs ENABLE TRIGGER trg_immutable_audit_logs;
    RAISE;
  END;
  
  RETURN;
END;
$$;

-- ================================================================
-- FIX 3: verify_log_chain com id tiebreaker
-- ================================================================
CREATE OR REPLACE FUNCTION public.verify_log_chain(
  p_tenant_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  total_logs BIGINT,
  valid_links BIGINT,
  broken_links BIGINT,
  chain_integrity_percent NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH chain AS (
    SELECT 
      al.id,
      al.integrity_hash,
      al.previous_log_hash,
      al.created_at,
      LAG(al.integrity_hash) OVER (ORDER BY al.created_at ASC, al.id ASC) as expected_prev
    FROM audit_logs al
    WHERE al.tenant_id = p_tenant_id
      AND (p_start_date IS NULL OR al.created_at >= p_start_date)
      AND (p_end_date IS NULL OR al.created_at <= p_end_date)
  )
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE 
      (expected_prev IS NULL AND chain.previous_log_hash = 'GENESIS')
      OR (expected_prev IS NOT NULL AND chain.previous_log_hash = expected_prev)
    )::BIGINT,
    COUNT(*) FILTER (WHERE 
      (expected_prev IS NOT NULL AND chain.previous_log_hash != expected_prev)
      OR (expected_prev IS NULL AND chain.previous_log_hash != 'GENESIS')
    )::BIGINT,
    ROUND(
      COUNT(*) FILTER (WHERE 
        (expected_prev IS NULL AND chain.previous_log_hash = 'GENESIS')
        OR (expected_prev IS NOT NULL AND chain.previous_log_hash = expected_prev)
      )::NUMERIC * 100.0 / GREATEST(COUNT(*), 1), 2
    )
  FROM chain;
END;
$$;
