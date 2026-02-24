
-- V-205: Add tenant_id to TIER 1 + TIER 2 tables (14 tables)
-- This adds direct tenant_id for performance (eliminates JOIN in RLS) and referential integrity

-- ============================================================
-- GROUP A: Tables with agent_id (backfill via agents.tenant_id)
-- ============================================================

-- 1. agent_tokens (27 rows)
ALTER TABLE public.agent_tokens ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_tokens t SET tenant_id = a.tenant_id FROM public.agents a WHERE a.id = t.agent_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tokens_tenant_id ON public.agent_tokens(tenant_id);

-- 2. agent_signing_keys (12 rows)
ALTER TABLE public.agent_signing_keys ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_signing_keys t SET tenant_id = a.tenant_id FROM public.agents a WHERE a.id = t.agent_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_tenant_id ON public.agent_signing_keys(tenant_id);

-- 3. agent_archive_events (0 rows)
ALTER TABLE public.agent_archive_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_archive_events t SET tenant_id = a.tenant_id FROM public.agents a WHERE a.id = t.agent_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_archive_events_tenant_id ON public.agent_archive_events(tenant_id);

-- 4. agent_execution_chain (14 rows)
ALTER TABLE public.agent_execution_chain ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_execution_chain t SET tenant_id = a.tenant_id FROM public.agents a WHERE a.id = t.agent_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_execution_chain_tenant_id ON public.agent_execution_chain(tenant_id);

-- 5. agent_hmac_format_cache (14 rows)
ALTER TABLE public.agent_hmac_format_cache ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_hmac_format_cache t SET tenant_id = a.tenant_id FROM public.agents a WHERE a.id = t.agent_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_hmac_format_cache_tenant_id ON public.agent_hmac_format_cache(tenant_id);

-- 6. agent_tag_assignments (0 rows)
ALTER TABLE public.agent_tag_assignments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_tag_assignments t SET tenant_id = a.tenant_id FROM public.agents a WHERE a.id = t.agent_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tag_assignments_tenant_id ON public.agent_tag_assignments(tenant_id);

-- 7. agent_updates (0 rows)
ALTER TABLE public.agent_updates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_updates t SET tenant_id = a.tenant_id FROM public.agents a WHERE a.id = t.agent_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_updates_tenant_id ON public.agent_updates(tenant_id);

-- ============================================================
-- GROUP B: Tables with group_id (backfill via agent_groups.tenant_id)
-- ============================================================

-- 8. agents_groups (9 rows)
ALTER TABLE public.agents_groups ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agents_groups t SET tenant_id = g.tenant_id FROM public.agent_groups g WHERE g.id = t.group_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_groups_tenant_id ON public.agents_groups(tenant_id);

-- 9. agent_group_policies (13 rows)
ALTER TABLE public.agent_group_policies ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.agent_group_policies t SET tenant_id = g.tenant_id FROM public.agent_groups g WHERE g.id = t.group_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_group_policies_tenant_id ON public.agent_group_policies(tenant_id);

-- ============================================================
-- GROUP C: Tables with policy_id (backfill via security_policies.tenant_id)
-- ============================================================

-- 10. policy_rules (0 rows)
ALTER TABLE public.policy_rules ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.policy_rules t SET tenant_id = sp.tenant_id FROM public.security_policies sp WHERE sp.id = t.policy_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_policy_rules_tenant_id ON public.policy_rules(tenant_id);

-- 11. security_policy_rules (4 rows)
ALTER TABLE public.security_policy_rules ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.security_policy_rules t SET tenant_id = sp.tenant_id FROM public.security_policies sp WHERE sp.id = t.policy_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_security_policy_rules_tenant_id ON public.security_policy_rules(tenant_id);

-- ============================================================
-- GROUP D: Table with playbook_id (backfill via playbooks.tenant_id)
-- ============================================================

-- 12. playbook_actions (41 rows)
ALTER TABLE public.playbook_actions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
UPDATE public.playbook_actions t SET tenant_id = p.tenant_id FROM public.playbooks p WHERE p.id = t.playbook_id AND t.tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_playbook_actions_tenant_id ON public.playbook_actions(tenant_id);

-- ============================================================
-- GROUP E: Tables needing tenant_id without FK for backfill
-- ============================================================

-- 13. signed_documents (0 rows - no backfill needed)
ALTER TABLE public.signed_documents ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_tenant_id ON public.signed_documents(tenant_id);

-- 14. runbooks (10 rows - assign to first tenant as system templates)
ALTER TABLE public.runbooks ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS idx_runbooks_tenant_id ON public.runbooks(tenant_id);

-- ============================================================
-- RLS POLICY UPGRADES: Add direct tenant_id policies for key tables
-- These replace JOIN-based policies with direct column checks for performance
-- ============================================================

-- agent_tokens: Replace JOIN-based policy with direct check
DROP POLICY IF EXISTS "agent_tokens_select_active_tenant" ON public.agent_tokens;
CREATE POLICY "agent_tokens_select_tenant_direct"
ON public.agent_tokens FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

DROP POLICY IF EXISTS "agent_tokens_update_active_tenant_v206" ON public.agent_tokens;
CREATE POLICY "agent_tokens_update_tenant_direct"
ON public.agent_tokens FOR UPDATE TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

DROP POLICY IF EXISTS "agent_tokens_delete_active_tenant_v206" ON public.agent_tokens;
CREATE POLICY "agent_tokens_delete_tenant_direct"
ON public.agent_tokens FOR DELETE TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

-- agent_signing_keys: Add tenant-direct SELECT
DROP POLICY IF EXISTS "agent_signing_keys_select_active_tenant" ON public.agent_signing_keys;
CREATE POLICY "agent_signing_keys_select_tenant_direct"
ON public.agent_signing_keys FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

-- signed_documents: Replace overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view signed documents" ON public.signed_documents;
CREATE POLICY "signed_documents_select_tenant_direct"
ON public.signed_documents FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

-- runbooks: Replace overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view runbooks" ON public.runbooks;
DROP POLICY IF EXISTS "operator_admin_select_runbooks" ON public.runbooks;
CREATE POLICY "runbooks_select_tenant_direct"
ON public.runbooks FOR SELECT TO authenticated
USING (
  (tenant_id IS NULL) -- System templates visible to all
  OR (tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Admins can manage runbooks_v206" ON public.runbooks;
CREATE POLICY "runbooks_manage_tenant_direct"
ON public.runbooks FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- agent_archive_events: Replace JOIN-based policies with direct
DROP POLICY IF EXISTS "agent_archive_events_select_active_tenant" ON public.agent_archive_events;
DROP POLICY IF EXISTS "Tenant users can view own archive events" ON public.agent_archive_events;
CREATE POLICY "agent_archive_events_select_tenant_direct"
ON public.agent_archive_events FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);

-- playbook_actions: Replace JOIN-based policies with direct
DROP POLICY IF EXISTS "playbook_actions_select_active_tenant" ON public.playbook_actions;
DROP POLICY IF EXISTS "playbook_actions_all_active_tenant_v206" ON public.playbook_actions;
CREATE POLICY "playbook_actions_select_tenant_direct"
ON public.playbook_actions FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);
CREATE POLICY "playbook_actions_manage_tenant_direct"
ON public.playbook_actions FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- policy_rules: Replace JOIN-based policies with direct
DROP POLICY IF EXISTS "policy_rules_select_active_tenant" ON public.policy_rules;
DROP POLICY IF EXISTS "policy_rules_all_active_tenant_v206" ON public.policy_rules;
CREATE POLICY "policy_rules_select_tenant_direct"
ON public.policy_rules FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);
CREATE POLICY "policy_rules_manage_tenant_direct"
ON public.policy_rules FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- security_policy_rules: Replace JOIN-based policies with direct
DROP POLICY IF EXISTS "security_policy_rules_select_active_tenant" ON public.security_policy_rules;
DROP POLICY IF EXISTS "security_policy_rules_all_active_tenant_v206" ON public.security_policy_rules;
CREATE POLICY "security_policy_rules_select_tenant_direct"
ON public.security_policy_rules FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);
CREATE POLICY "security_policy_rules_manage_tenant_direct"
ON public.security_policy_rules FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- agent_group_policies: Replace JOIN-based with direct
DROP POLICY IF EXISTS "agent_group_policies_select_active_tenant" ON public.agent_group_policies;
DROP POLICY IF EXISTS "agent_group_policies_all_active_tenant_v206" ON public.agent_group_policies;
CREATE POLICY "agent_group_policies_select_tenant_direct"
ON public.agent_group_policies FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);
CREATE POLICY "agent_group_policies_manage_tenant_direct"
ON public.agent_group_policies FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- agents_groups: Replace JOIN-based with direct
DROP POLICY IF EXISTS "agents_groups_select_active_tenant" ON public.agents_groups;
DROP POLICY IF EXISTS "agents_groups_delete_active_tenant_v206" ON public.agents_groups;
DROP POLICY IF EXISTS "agents_groups_update_active_tenant_v206" ON public.agents_groups;
CREATE POLICY "agents_groups_select_tenant_direct"
ON public.agents_groups FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR is_current_super_admin()
);
CREATE POLICY "agents_groups_manage_tenant_direct"
ON public.agents_groups FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- ============================================================
-- GLOBAL TABLE DOCUMENTATION (TIER 3 reclassification)
-- ============================================================
COMMENT ON TABLE public.incident_slo_state IS 'GLOBAL: Cross-tenant SLO aggregation tied to failure_fingerprints. No tenant_id by design.';
COMMENT ON TABLE public.event_risk_scoring IS 'GLOBAL: System-wide risk scoring rules. Super admin only.';
COMMENT ON TABLE public.decision_rules IS 'GLOBAL: System-wide decision engine rules. Super admin only.';
COMMENT ON TABLE public.ai_action_configs IS 'GLOBAL: System-wide AI action configs. Super admin only.';
COMMENT ON TABLE public.failure_fingerprints IS 'GLOBAL: Cross-tenant failure aggregation (has distinct_tenants column). No tenant_id by design.';
COMMENT ON TABLE public.slo_definitions IS 'GLOBAL: System-wide SLO definitions. Super admin only.';
COMMENT ON TABLE public.agent_update_policies IS 'GLOBAL: System-wide agent update rollout policies. Super admin only.';
