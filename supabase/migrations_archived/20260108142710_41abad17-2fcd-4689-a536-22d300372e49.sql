-- =============================================================================
-- ADR-026 FINAL CLOSURE: Active Tenant Policies + Legacy Removal
-- =============================================================================
-- NOTE: agent_tokens has no tenant_id column - it's isolated via agent_id->agents.tenant_id
-- =============================================================================

-- ============================================
-- STEP 1A: Create Active Tenant Policies for 15 Tables (with tenant_id)
-- ============================================

-- 1. ai_action_logs
ALTER TABLE public.ai_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_action_logs_select_active_tenant"
ON public.ai_action_logs FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "ai_action_logs_insert_active_tenant"
ON public.ai_action_logs FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "ai_action_logs_update_active_tenant"
ON public.ai_action_logs FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "ai_action_logs_delete_active_tenant"
ON public.ai_action_logs FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 2. api_keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select_active_tenant"
ON public.api_keys FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "api_keys_insert_active_tenant"
ON public.api_keys FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "api_keys_update_active_tenant"
ON public.api_keys FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "api_keys_delete_active_tenant"
ON public.api_keys FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 3. api_request_logs
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_request_logs_select_active_tenant"
ON public.api_request_logs FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "api_request_logs_insert_active_tenant"
ON public.api_request_logs FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "api_request_logs_update_active_tenant"
ON public.api_request_logs FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "api_request_logs_delete_active_tenant"
ON public.api_request_logs FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 4. compliance_policies
ALTER TABLE public.compliance_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_policies_select_active_tenant"
ON public.compliance_policies FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "compliance_policies_insert_active_tenant"
ON public.compliance_policies FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "compliance_policies_update_active_tenant"
ON public.compliance_policies FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "compliance_policies_delete_active_tenant"
ON public.compliance_policies FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 5. failed_login_attempts
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "failed_login_attempts_select_active_tenant"
ON public.failed_login_attempts FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "failed_login_attempts_insert_active_tenant"
ON public.failed_login_attempts FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "failed_login_attempts_update_active_tenant"
ON public.failed_login_attempts FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "failed_login_attempts_delete_active_tenant"
ON public.failed_login_attempts FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 6. quarantined_files
ALTER TABLE public.quarantined_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quarantined_files_select_active_tenant"
ON public.quarantined_files FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "quarantined_files_insert_active_tenant"
ON public.quarantined_files FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "quarantined_files_update_active_tenant"
ON public.quarantined_files FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "quarantined_files_delete_active_tenant"
ON public.quarantined_files FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 7. report_executions
ALTER TABLE public.report_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_executions_select_active_tenant"
ON public.report_executions FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "report_executions_insert_active_tenant"
ON public.report_executions FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "report_executions_update_active_tenant"
ON public.report_executions FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "report_executions_delete_active_tenant"
ON public.report_executions FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 8. reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_select_active_tenant"
ON public.reports FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "reports_insert_active_tenant"
ON public.reports FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "reports_update_active_tenant"
ON public.reports FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "reports_delete_active_tenant"
ON public.reports FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 9. security_logs
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_logs_select_active_tenant"
ON public.security_logs FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "security_logs_insert_active_tenant"
ON public.security_logs FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "security_logs_update_active_tenant"
ON public.security_logs FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "security_logs_delete_active_tenant"
ON public.security_logs FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 10. soc2_controls
ALTER TABLE public.soc2_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "soc2_controls_select_active_tenant"
ON public.soc2_controls FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "soc2_controls_insert_active_tenant"
ON public.soc2_controls FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "soc2_controls_update_active_tenant"
ON public.soc2_controls FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "soc2_controls_delete_active_tenant"
ON public.soc2_controls FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 11. soc2_criteria
ALTER TABLE public.soc2_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "soc2_criteria_select_active_tenant"
ON public.soc2_criteria FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "soc2_criteria_insert_active_tenant"
ON public.soc2_criteria FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "soc2_criteria_update_active_tenant"
ON public.soc2_criteria FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "soc2_criteria_delete_active_tenant"
ON public.soc2_criteria FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 12. tenant_settings
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_settings_select_active_tenant"
ON public.tenant_settings FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "tenant_settings_insert_active_tenant"
ON public.tenant_settings FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "tenant_settings_update_active_tenant"
ON public.tenant_settings FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "tenant_settings_delete_active_tenant"
ON public.tenant_settings FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 13. tenant_subscriptions
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_subscriptions_select_active_tenant"
ON public.tenant_subscriptions FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "tenant_subscriptions_insert_active_tenant"
ON public.tenant_subscriptions FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "tenant_subscriptions_update_active_tenant"
ON public.tenant_subscriptions FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "tenant_subscriptions_delete_active_tenant"
ON public.tenant_subscriptions FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 14. vendor_risk_registry
ALTER TABLE public.vendor_risk_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_risk_registry_select_active_tenant"
ON public.vendor_risk_registry FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "vendor_risk_registry_insert_active_tenant"
ON public.vendor_risk_registry FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "vendor_risk_registry_update_active_tenant"
ON public.vendor_risk_registry FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "vendor_risk_registry_delete_active_tenant"
ON public.vendor_risk_registry FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 15. virus_scans
ALTER TABLE public.virus_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "virus_scans_select_active_tenant"
ON public.virus_scans FOR SELECT
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "virus_scans_insert_active_tenant"
ON public.virus_scans FOR INSERT
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "virus_scans_update_active_tenant"
ON public.virus_scans FOR UPDATE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE POLICY "virus_scans_delete_active_tenant"
ON public.virus_scans FOR DELETE
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- ============================================
-- STEP 1B: Create Active Tenant Policies for agent_tokens (via agent_id join)
-- ============================================

-- First drop the legacy policy
DROP POLICY IF EXISTS "agent_tokens_select_multitenant" ON public.agent_tokens;

CREATE POLICY "agent_tokens_select_active_tenant"
ON public.agent_tokens FOR SELECT
USING (
  public.is_current_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.agents a 
    WHERE a.id = agent_tokens.agent_id 
      AND a.tenant_id = public.get_active_tenant_id()
  )
);

CREATE POLICY "agent_tokens_insert_active_tenant"
ON public.agent_tokens FOR INSERT
WITH CHECK (
  public.is_current_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.agents a 
    WHERE a.id = agent_tokens.agent_id 
      AND a.tenant_id = public.get_active_tenant_id()
  )
);

CREATE POLICY "agent_tokens_update_active_tenant"
ON public.agent_tokens FOR UPDATE
USING (
  public.is_current_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.agents a 
    WHERE a.id = agent_tokens.agent_id 
      AND a.tenant_id = public.get_active_tenant_id()
  )
)
WITH CHECK (
  public.is_current_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.agents a 
    WHERE a.id = agent_tokens.agent_id 
      AND a.tenant_id = public.get_active_tenant_id()
  )
);

CREATE POLICY "agent_tokens_delete_active_tenant"
ON public.agent_tokens FOR DELETE
USING (
  public.is_current_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.agents a 
    WHERE a.id = agent_tokens.agent_id 
      AND a.tenant_id = public.get_active_tenant_id()
  )
);

-- ============================================
-- STEP 2: Remove ALL Legacy Policies
-- ============================================

DO $$
DECLARE
  r RECORD;
  removed_count INT := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual::text ILIKE '%user_has_tenant_access%'
        OR qual::text ILIKE '%user_belongs_to_tenant%'
        OR policyname ILIKE '%multitenant%'
        OR policyname ILIKE '%tenant_isolation%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
    removed_count := removed_count + 1;
    RAISE NOTICE 'Removed legacy policy: %.% -> %', r.schemaname, r.tablename, r.policyname;
  END LOOP;
  
  RAISE NOTICE 'LEGACY CLEANUP COMPLETE: Removed % policies', removed_count;
END $$;

-- ============================================
-- STEP 3: Update v_risk_debt_active View
-- ============================================

CREATE OR REPLACE VIEW public.v_risk_debt_active AS
SELECT 
  t.id,
  t.tenant_id,
  t.title,
  t.severity,
  t.closed_at AS accepted_at,
  (t.closure_evidence->>'expiry_date')::timestamptz AS expires_at,
  t.closure_reason AS justification,
  t.closed_by AS accepted_by,
  (t.closure_evidence->>'approved_by') AS approved_by
FROM public.tasks t
WHERE
  t.status = 'accepted_risk'
  AND (t.closure_evidence->>'expiry_date') IS NOT NULL
  AND (t.closure_evidence->>'expiry_date')::timestamptz > now();

-- ============================================
-- STEP 4: Final Validation
-- ============================================

DO $$
DECLARE
  legacy_count INT;
  active_count INT;
BEGIN
  -- Count remaining legacy policies
  SELECT COUNT(*) INTO legacy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      qual::text ILIKE '%user_has_tenant_access%'
      OR qual::text ILIKE '%user_belongs_to_tenant%'
    );
  
  -- Count active_tenant policies
  SELECT COUNT(*) INTO active_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE '%_active_tenant';
  
  IF legacy_count > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % legacy policies still exist', legacy_count;
  END IF;
  
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'ADR-026 CLOSURE COMPLETE';
  RAISE NOTICE '----------------------------------------------';
  RAISE NOTICE 'Legacy policies remaining: %', legacy_count;
  RAISE NOTICE 'Active tenant policies: %', active_count;
  RAISE NOTICE '==============================================';
END $$;