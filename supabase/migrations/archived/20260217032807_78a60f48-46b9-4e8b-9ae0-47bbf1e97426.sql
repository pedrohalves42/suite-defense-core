
-- =============================================
-- 1. Auto-approval RPC: Bulk approve pending actions for safe categories
-- =============================================
CREATE OR REPLACE FUNCTION public.auto_approve_safe_actions(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approved_count int := 0;
  v_categories text[];
  v_result jsonb;
BEGIN
  -- Only allow service_role or super_admin
  IF NOT (
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin' AND tenant_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get safe categories (requires_approval = false AND is_enabled = true)
  SELECT array_agg(action_type) INTO v_categories
  FROM ai_action_configs
  WHERE requires_approval = false AND is_enabled = true;

  IF v_categories IS NULL OR array_length(v_categories, 1) = 0 THEN
    RETURN jsonb_build_object('approved_count', 0, 'categories', '[]'::jsonb, 'message', 'No auto-approvable categories found');
  END IF;

  -- Bulk approve pending actions in safe categories
  WITH approved AS (
    UPDATE ai_actions
    SET status = 'approved',
        approved_at = now(),
        approved_by = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    WHERE status = 'pending'
      AND action_type = ANY(v_categories)
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    RETURNING id
  )
  SELECT count(*) INTO v_approved_count FROM approved;

  RETURN jsonb_build_object(
    'approved_count', v_approved_count,
    'categories', to_jsonb(v_categories),
    'message', format('%s actions auto-approved across %s categories', v_approved_count, array_length(v_categories, 1))
  );
END;
$$;

-- =============================================
-- 2. Rollback test table for dry-run results
-- =============================================
CREATE TABLE IF NOT EXISTS public.rollback_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_id uuid REFERENCES agents(id),
  test_type text NOT NULL DEFAULT 'version_rollback',
  dry_run boolean NOT NULL DEFAULT true,
  from_version text,
  to_version text,
  test_status text NOT NULL DEFAULT 'pending' CHECK (test_status IN ('pending', 'running', 'passed', 'failed', 'skipped')),
  steps_executed jsonb DEFAULT '[]'::jsonb,
  steps_total int DEFAULT 0,
  error_message text,
  duration_ms int,
  initiated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.rollback_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view rollback tests"
  ON public.rollback_test_results FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins can create rollback tests"
  ON public.rollback_test_results FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND tenant_id = rollback_test_results.tenant_id)
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Admins can update rollback tests"
  ON public.rollback_test_results FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND tenant_id = rollback_test_results.tenant_id)
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- =============================================
-- 3. RPC to execute a dry-run rollback test
-- =============================================
CREATE OR REPLACE FUNCTION public.execute_rollback_test(
  p_tenant_id uuid,
  p_agent_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test_id uuid;
  v_agent record;
  v_steps jsonb := '[]'::jsonb;
  v_step_count int := 0;
  v_total_steps int := 5;
  v_start_time timestamptz := clock_timestamp();
  v_status text := 'passed';
  v_error text;
  v_from_version text;
  v_to_version text;
BEGIN
  -- Auth check
  IF NOT (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND tenant_id = p_tenant_id)
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get agent info
  IF p_agent_id IS NOT NULL THEN
    SELECT * INTO v_agent FROM agents WHERE id = p_agent_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agent not found';
    END IF;
    v_from_version := v_agent.agent_version;
  ELSE
    -- Pick first online agent for test
    SELECT * INTO v_agent FROM agents WHERE tenant_id = p_tenant_id AND status = 'healthy' LIMIT 1;
    v_from_version := COALESCE(v_agent.agent_version, 'unknown');
  END IF;

  -- Determine rollback target version
  SELECT to_version INTO v_to_version
  FROM agent_rollback_events
  WHERE tenant_id = p_tenant_id
  ORDER BY created_at DESC LIMIT 1;
  
  v_to_version := COALESCE(v_to_version, 'previous');

  -- Create test record
  INSERT INTO rollback_test_results (tenant_id, agent_id, dry_run, from_version, to_version, test_status, steps_total, initiated_by)
  VALUES (p_tenant_id, p_agent_id, p_dry_run, v_from_version, v_to_version, 'running', v_total_steps, auth.uid())
  RETURNING id INTO v_test_id;

  -- Step 1: Verify agent build cache exists
  v_step_count := v_step_count + 1;
  IF EXISTS (SELECT 1 FROM agent_builds WHERE agent_id = COALESCE(p_agent_id, v_agent.id) AND build_status = 'completed') THEN
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'build_cache_check', 'status', 'passed', 'detail', 'Previous build found in cache');
  ELSE
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'build_cache_check', 'status', 'warning', 'detail', 'No previous build in cache - rebuild required');
  END IF;

  -- Step 2: Verify rollback state machine allows transition
  v_step_count := v_step_count + 1;
  IF v_agent.status IS NOT NULL AND v_agent.status IN ('healthy', 'degraded', 'updating', 'safe_mode') THEN
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'state_machine_check', 'status', 'passed', 'detail', format('Agent state %s allows rollback transition', v_agent.status));
  ELSE
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'state_machine_check', 'status', 'failed', 'detail', format('Agent state %s does not allow rollback', COALESCE(v_agent.status, 'unknown')));
    v_status := 'failed';
    v_error := 'Agent state does not allow rollback';
  END IF;

  -- Step 3: Verify file integrity baseline exists
  v_step_count := v_step_count + 1;
  IF EXISTS (SELECT 1 FROM agent_file_integrity WHERE agent_id = COALESCE(p_agent_id, v_agent.id) LIMIT 1) THEN
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'integrity_baseline', 'status', 'passed', 'detail', 'File integrity baseline exists for comparison');
  ELSE
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'integrity_baseline', 'status', 'warning', 'detail', 'No integrity baseline - post-rollback verification limited');
  END IF;

  -- Step 4: Verify execution chain continuity
  v_step_count := v_step_count + 1;
  IF EXISTS (SELECT 1 FROM agent_execution_chain WHERE agent_id = COALESCE(p_agent_id, v_agent.id)) THEN
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'execution_chain', 'status', 'passed', 'detail', 'Execution chain intact - audit trail preserved');
  ELSE
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'execution_chain', 'status', 'warning', 'detail', 'No execution chain - rollback audit may be incomplete');
  END IF;

  -- Step 5: Simulate rollback event creation (dry-run only logs, real creates event)
  v_step_count := v_step_count + 1;
  IF p_dry_run THEN
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'rollback_simulation', 'status', 'passed', 'detail', format('DRY RUN: Would rollback %s ? %s', v_from_version, v_to_version));
  ELSE
    -- Real rollback: create rollback event
    INSERT INTO agent_rollback_events (agent_id, tenant_id, from_version, to_version, reason, status)
    VALUES (COALESCE(p_agent_id, v_agent.id), p_tenant_id, v_from_version, v_to_version, 'Manual rollback test', 'initiated');
    v_steps := v_steps || jsonb_build_object('step', v_step_count, 'name', 'rollback_execution', 'status', 'passed', 'detail', format('Rollback event created: %s ? %s', v_from_version, v_to_version));
  END IF;

  -- Finalize test result
  UPDATE rollback_test_results
  SET test_status = v_status,
      steps_executed = v_steps,
      error_message = v_error,
      duration_ms = EXTRACT(MILLISECOND FROM clock_timestamp() - v_start_time)::int,
      completed_at = now()
  WHERE id = v_test_id;

  RETURN jsonb_build_object(
    'test_id', v_test_id,
    'status', v_status,
    'dry_run', p_dry_run,
    'from_version', v_from_version,
    'to_version', v_to_version,
    'steps', v_steps,
    'duration_ms', EXTRACT(MILLISECOND FROM clock_timestamp() - v_start_time)::int
  );
END;
$$;
