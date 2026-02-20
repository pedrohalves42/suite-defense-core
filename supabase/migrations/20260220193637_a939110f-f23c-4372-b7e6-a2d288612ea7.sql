
-- =============================================
-- ADR-036: Reanchor Broken Chains Functions
-- =============================================

-- 1. Function to diagnose chain health across both chain types
CREATE OR REPLACE FUNCTION public.diagnose_chain_health(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_breaks INT;
  v_exec_agents_with_gaps INT;
  v_exec_total_gaps INT;
  v_audit_details JSONB;
  v_exec_details JSONB;
BEGIN
  -- Only service_role or super_admin
  IF NOT (
    current_setting('role', true) = 'service_role' 
    OR is_current_super_admin()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: requires service_role or super_admin';
  END IF;

  -- === AUDIT LOG CHAIN ===
  SELECT COUNT(*), jsonb_agg(jsonb_build_object(
    'id', sub.id, 
    'created_at', sub.created_at,
    'previous_log_hash', sub.previous_log_hash
  ))
  INTO v_audit_breaks, v_audit_details
  FROM (
    SELECT a.id, a.created_at, a.previous_log_hash
    FROM audit_logs a
    WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
      AND a.previous_log_hash IS NOT NULL
      AND a.previous_log_hash != 'GENESIS'
      AND NOT EXISTS (
        SELECT 1 FROM audit_logs b 
        WHERE b.integrity_hash = a.previous_log_hash
        AND b.tenant_id = a.tenant_id
      )
    ORDER BY a.created_at ASC
    LIMIT 50
  ) sub;

  -- === EXECUTION HASH CHAIN ===
  SELECT COUNT(*), COALESCE(SUM(gaps), 0), 
    jsonb_agg(jsonb_build_object(
      'agent_id', agent_id,
      'min_idx', min_idx,
      'max_idx', max_idx,
      'expected', expected,
      'actual', actual,
      'gaps', gaps
    ))
  INTO v_exec_agents_with_gaps, v_exec_total_gaps, v_exec_details
  FROM (
    SELECT 
      je.agent_id,
      MIN(je.execution_index) as min_idx,
      MAX(je.execution_index) as max_idx,
      (MAX(je.execution_index) - MIN(je.execution_index) + 1) as expected,
      COUNT(*) as actual,
      (MAX(je.execution_index) - MIN(je.execution_index) + 1 - COUNT(*)) as gaps
    FROM job_executions je
    JOIN agents ag ON ag.id = je.agent_id
    WHERE je.execution_index IS NOT NULL 
      AND je.execution_hash IS NOT NULL
      AND (p_tenant_id IS NULL OR je.tenant_id = p_tenant_id)
    GROUP BY je.agent_id
    HAVING COUNT(*) != (MAX(je.execution_index) - MIN(je.execution_index) + 1)
  ) sub;

  RETURN jsonb_build_object(
    'audit_chain', jsonb_build_object(
      'breaks_found', COALESCE(v_audit_breaks, 0),
      'details', COALESCE(v_audit_details, '[]'::jsonb)
    ),
    'execution_chain', jsonb_build_object(
      'agents_with_gaps', COALESCE(v_exec_agents_with_gaps, 0),
      'total_gaps', COALESCE(v_exec_total_gaps, 0),
      'details', COALESCE(v_exec_details, '[]'::jsonb)
    ),
    'diagnosed_at', now(),
    'diagnosed_by', auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.diagnose_chain_health(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.diagnose_chain_health(UUID) TO authenticated, service_role;

-- 2. Function to reanchor execution chains by re-indexing from current state
CREATE OR REPLACE FUNCTION public.reanchor_execution_chains(p_agent_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_fixed_count INT := 0;
  v_agents_fixed INT := 0;
  v_results JSONB := '[]'::jsonb;
  v_last_hash TEXT;
  v_last_index INT;
BEGIN
  -- Only service_role or super_admin
  IF NOT (
    current_setting('role', true) = 'service_role' 
    OR is_current_super_admin()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: requires service_role or super_admin';
  END IF;

  -- For each agent with gaps
  FOR v_agent IN 
    SELECT je.agent_id, MAX(je.execution_index) as max_idx
    FROM job_executions je
    WHERE je.execution_index IS NOT NULL
      AND je.execution_hash IS NOT NULL
      AND (p_agent_id IS NULL OR je.agent_id = p_agent_id)
    GROUP BY je.agent_id
    HAVING COUNT(*) != (MAX(je.execution_index) - MIN(je.execution_index) + 1)
  LOOP
    -- Get the last valid execution for this agent
    SELECT execution_hash, execution_index
    INTO v_last_hash, v_last_index
    FROM job_executions
    WHERE agent_id = v_agent.agent_id
      AND execution_hash IS NOT NULL
    ORDER BY execution_index DESC
    LIMIT 1;

    -- Update the chain anchor to match the last valid execution
    UPDATE agent_execution_chain
    SET last_execution_hash = v_last_hash,
        last_execution_index = v_last_index,
        updated_at = now()
    WHERE agent_id = v_agent.agent_id
      AND (last_execution_hash != v_last_hash OR last_execution_index != v_last_index);

    v_agents_fixed := v_agents_fixed + 1;
    v_results := v_results || jsonb_build_object(
      'agent_id', v_agent.agent_id,
      'new_anchor_index', v_last_index,
      'new_anchor_hash', v_last_hash
    );
  END LOOP;

  -- Log the reanchor event
  INSERT INTO security_logs (
    tenant_id, event_type, severity, source, details
  )
  SELECT 
    COALESCE(get_active_tenant_id(), (SELECT tenant_id FROM agents WHERE id = p_agent_id LIMIT 1)),
    'CHAIN_REANCHOR',
    'warning',
    'ADR-036',
    jsonb_build_object(
      'agents_fixed', v_agents_fixed,
      'initiated_by', auth.uid(),
      'results', v_results
    )
  WHERE v_agents_fixed > 0;

  RETURN jsonb_build_object(
    'success', true,
    'agents_reanchored', v_agents_fixed,
    'details', v_results,
    'executed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reanchor_execution_chains(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reanchor_execution_chains(UUID) TO authenticated, service_role;

-- 3. Function to repair audit log chain breaks by re-linking orphaned entries
CREATE OR REPLACE FUNCTION public.reanchor_audit_log_chain(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log RECORD;
  v_prev_hash TEXT := NULL;
  v_fixed INT := 0;
  v_total INT := 0;
BEGIN
  -- Only service_role or super_admin  
  IF NOT (
    current_setting('role', true) = 'service_role' 
    OR is_current_super_admin()
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: requires service_role or super_admin';
  END IF;

  -- Temporarily disable the immutability trigger for this repair
  ALTER TABLE audit_logs DISABLE TRIGGER tr_prevent_audit_modification;

  BEGIN
    -- Walk the chain chronologically and fix broken links
    FOR v_log IN 
      SELECT id, integrity_hash, previous_log_hash, created_at
      FROM audit_logs
      WHERE tenant_id = p_tenant_id
      ORDER BY created_at ASC
    LOOP
      v_total := v_total + 1;
      
      IF v_total = 1 THEN
        -- First log should have GENESIS
        IF v_log.previous_log_hash IS DISTINCT FROM 'GENESIS' THEN
          UPDATE audit_logs SET previous_log_hash = 'GENESIS' WHERE id = v_log.id;
          v_fixed := v_fixed + 1;
        END IF;
      ELSE
        -- Subsequent logs should reference the previous log's integrity_hash
        IF v_log.previous_log_hash IS DISTINCT FROM v_prev_hash THEN
          UPDATE audit_logs SET previous_log_hash = v_prev_hash WHERE id = v_log.id;
          v_fixed := v_fixed + 1;
        END IF;
      END IF;
      
      v_prev_hash := v_log.integrity_hash;
    END LOOP;

    -- Re-enable the immutability trigger
    ALTER TABLE audit_logs ENABLE TRIGGER tr_prevent_audit_modification;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ensure trigger is re-enabled even on error
    ALTER TABLE audit_logs ENABLE TRIGGER tr_prevent_audit_modification;
    RAISE;
  END;

  -- Log the repair event
  IF v_fixed > 0 THEN
    -- Temporarily disable trigger again for this security log insert
    INSERT INTO security_logs (
      tenant_id, event_type, severity, source, details
    ) VALUES (
      p_tenant_id,
      'AUDIT_CHAIN_REANCHOR',
      'warning',
      'ADR-036',
      jsonb_build_object(
        'total_logs', v_total,
        'links_repaired', v_fixed,
        'initiated_by', auth.uid(),
        'repaired_at', now()
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_logs_scanned', v_total,
    'links_repaired', v_fixed,
    'executed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reanchor_audit_log_chain(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reanchor_audit_log_chain(UUID) TO authenticated, service_role;
