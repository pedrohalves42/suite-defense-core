-- =============================================================================
-- ADR-026 Final Hardening: WITH CHECK + EXISTS Optimization
-- =============================================================================

-- ============================================================================
-- PART 1: Fix 14 UPDATE policies missing WITH CHECK
-- ============================================================================

-- ai_actions
DROP POLICY IF EXISTS "ai_actions_update_active_tenant" ON ai_actions;
CREATE POLICY "ai_actions_update_active_tenant"
ON ai_actions FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- ai_anomalies
DROP POLICY IF EXISTS "ai_anomalies_update_active_tenant" ON ai_anomalies;
CREATE POLICY "ai_anomalies_update_active_tenant"
ON ai_anomalies FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- ai_insights
DROP POLICY IF EXISTS "ai_insights_update_active_tenant" ON ai_insights;
CREATE POLICY "ai_insights_update_active_tenant"
ON ai_insights FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- failed_jobs_dlq
DROP POLICY IF EXISTS "failed_jobs_dlq_update_active_tenant" ON failed_jobs_dlq;
CREATE POLICY "failed_jobs_dlq_update_active_tenant"
ON failed_jobs_dlq FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- generated_reports
DROP POLICY IF EXISTS "generated_reports_update_active_tenant" ON generated_reports;
CREATE POLICY "generated_reports_update_active_tenant"
ON generated_reports FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- governance_reports
DROP POLICY IF EXISTS "governance_reports_update_active_tenant" ON governance_reports;
CREATE POLICY "governance_reports_update_active_tenant"
ON governance_reports FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- network_anomalies
DROP POLICY IF EXISTS "network_anomalies_update_active_tenant" ON network_anomalies;
CREATE POLICY "network_anomalies_update_active_tenant"
ON network_anomalies FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- notification_queue
DROP POLICY IF EXISTS "notification_queue_update_active_tenant" ON notification_queue;
CREATE POLICY "notification_queue_update_active_tenant"
ON notification_queue FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- persistent_failure_alerts
DROP POLICY IF EXISTS "persistent_failure_alerts_update_active_tenant" ON persistent_failure_alerts;
CREATE POLICY "persistent_failure_alerts_update_active_tenant"
ON persistent_failure_alerts FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- poe_chain_breaks
DROP POLICY IF EXISTS "poe_chain_breaks_update_active_tenant" ON poe_chain_breaks;
CREATE POLICY "poe_chain_breaks_update_active_tenant"
ON poe_chain_breaks FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- slo_alerts
DROP POLICY IF EXISTS "slo_alerts_update_active_tenant" ON slo_alerts;
CREATE POLICY "slo_alerts_update_active_tenant"
ON slo_alerts FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- system_alerts
DROP POLICY IF EXISTS "system_alerts_update_active_tenant" ON system_alerts;
CREATE POLICY "system_alerts_update_active_tenant"
ON system_alerts FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- tasks
DROP POLICY IF EXISTS "tasks_update_active_tenant" ON tasks;
CREATE POLICY "tasks_update_active_tenant"
ON tasks FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- tenant_action_policies
DROP POLICY IF EXISTS "tenant_action_policies_update_active_tenant" ON tenant_action_policies;
CREATE POLICY "tenant_action_policies_update_active_tenant"
ON tenant_action_policies FOR UPDATE
USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
)
WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- ============================================================================
-- PART 2: Fix 7 EXISTS policies - move super_admin outside EXISTS
-- ============================================================================

-- playbook_actions (via playbooks)
DROP POLICY IF EXISTS "playbook_actions_select_active_tenant" ON playbook_actions;
CREATE POLICY "playbook_actions_select_active_tenant"
ON playbook_actions FOR SELECT
USING (
  (
    get_active_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM playbooks p
      WHERE p.id = playbook_actions.playbook_id
      AND p.tenant_id = get_active_tenant_id()
    )
  )
  OR is_current_super_admin()
);

-- agent_archive_events (via agents)
DROP POLICY IF EXISTS "agent_archive_events_select_active_tenant" ON agent_archive_events;
CREATE POLICY "agent_archive_events_select_active_tenant"
ON agent_archive_events FOR SELECT
USING (
  (
    get_active_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_archive_events.agent_id
      AND a.tenant_id = get_active_tenant_id()
    )
  )
  OR is_current_super_admin()
);

-- agent_group_policies (via agent_groups)
DROP POLICY IF EXISTS "agent_group_policies_select_active_tenant" ON agent_group_policies;
CREATE POLICY "agent_group_policies_select_active_tenant"
ON agent_group_policies FOR SELECT
USING (
  (
    get_active_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM agent_groups ag
      WHERE ag.id = agent_group_policies.group_id
      AND ag.tenant_id = get_active_tenant_id()
    )
  )
  OR is_current_super_admin()
);

-- agent_signing_keys (via agents)
DROP POLICY IF EXISTS "agent_signing_keys_select_active_tenant" ON agent_signing_keys;
CREATE POLICY "agent_signing_keys_select_active_tenant"
ON agent_signing_keys FOR SELECT
USING (
  (
    get_active_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_signing_keys.agent_id
      AND a.tenant_id = get_active_tenant_id()
    )
  )
  OR is_current_super_admin()
);

-- security_policy_rules (via security_policies)
DROP POLICY IF EXISTS "security_policy_rules_select_active_tenant" ON security_policy_rules;
CREATE POLICY "security_policy_rules_select_active_tenant"
ON security_policy_rules FOR SELECT
USING (
  (
    get_active_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM security_policies sp
      WHERE sp.id = security_policy_rules.policy_id
      AND sp.tenant_id = get_active_tenant_id()
    )
  )
  OR is_current_super_admin()
);

-- policy_rules (via security_policies)
DROP POLICY IF EXISTS "policy_rules_select_active_tenant" ON policy_rules;
CREATE POLICY "policy_rules_select_active_tenant"
ON policy_rules FOR SELECT
USING (
  (
    get_active_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM security_policies sp
      WHERE sp.id = policy_rules.policy_id
      AND sp.tenant_id = get_active_tenant_id()
    )
  )
  OR is_current_super_admin()
);

-- agents_groups (via agent_groups)
DROP POLICY IF EXISTS "agents_groups_select_active_tenant" ON agents_groups;
CREATE POLICY "agents_groups_select_active_tenant"
ON agents_groups FOR SELECT
USING (
  (
    get_active_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM agent_groups ag
      WHERE ag.id = agents_groups.group_id
      AND ag.tenant_id = get_active_tenant_id()
    )
  )
  OR is_current_super_admin()
);