
-- =====================================================
-- ADR-026 MIGRATION BATCH 3: Agents + Security + Notifications
-- ~25 policies across agent/security/notification tables
-- =====================================================

-- === AGENT TABLES ===

-- 1. agent_archive_events (NO tenant_id - via agents)
DROP POLICY IF EXISTS "Users can view archive events for their agents" ON agent_archive_events;
DROP POLICY IF EXISTS "agent_archive_events_select_active_tenant" ON agent_archive_events;
CREATE POLICY "agent_archive_events_select_active_tenant" ON agent_archive_events
FOR SELECT USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = agent_archive_events.agent_id
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 2. agent_group_policies (NO tenant_id - via agent_groups)
DROP POLICY IF EXISTS "Admins can manage group policies" ON agent_group_policies;
DROP POLICY IF EXISTS "agent_group_policies_all_active_tenant" ON agent_group_policies;
CREATE POLICY "agent_group_policies_all_active_tenant" ON agent_group_policies
FOR ALL USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agent_groups ag
    WHERE ag.id = agent_group_policies.group_id
    AND (ag.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 3. agent_releases (NO tenant_id - super_admin only) - SELECT
DROP POLICY IF EXISTS "Anyone can read releases" ON agent_releases;
DROP POLICY IF EXISTS "agent_releases_select_super_admin" ON agent_releases;
CREATE POLICY "agent_releases_select_super_admin" ON agent_releases
FOR SELECT USING (is_current_super_admin());

-- 4. agent_releases (NO tenant_id - super_admin only) - ALL
DROP POLICY IF EXISTS "Super admins can manage releases" ON agent_releases;
DROP POLICY IF EXISTS "agent_releases_all_super_admin" ON agent_releases;
CREATE POLICY "agent_releases_all_super_admin" ON agent_releases
FOR ALL USING (is_current_super_admin());

-- 5. agent_rollback_events (has tenant_id)
DROP POLICY IF EXISTS "Users can view rollback events for their tenant" ON agent_rollback_events;
DROP POLICY IF EXISTS "agent_rollback_events_select_active_tenant" ON agent_rollback_events;
CREATE POLICY "agent_rollback_events_select_active_tenant" ON agent_rollback_events
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 6. agent_signing_keys (NO tenant_id - via agents)
DROP POLICY IF EXISTS "Authenticated users can view signing keys for their agents" ON agent_signing_keys;
DROP POLICY IF EXISTS "agent_signing_keys_select_active_tenant" ON agent_signing_keys;
CREATE POLICY "agent_signing_keys_select_active_tenant" ON agent_signing_keys
FOR SELECT USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM agents a
    WHERE a.id = agent_signing_keys.agent_id
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 7. agent_system_metrics (has tenant_id)
DROP POLICY IF EXISTS "Users can view agent system metrics in their tenant" ON agent_system_metrics;
DROP POLICY IF EXISTS "agent_system_metrics_select_active_tenant" ON agent_system_metrics;
CREATE POLICY "agent_system_metrics_select_active_tenant" ON agent_system_metrics
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 8. agent_system_metrics_2025_12 (has tenant_id)
DROP POLICY IF EXISTS "Users can view agent system metrics in their tenant" ON agent_system_metrics_2025_12;
DROP POLICY IF EXISTS "agent_system_metrics_2025_12_select_active_tenant" ON agent_system_metrics_2025_12;
CREATE POLICY "agent_system_metrics_2025_12_select_active_tenant" ON agent_system_metrics_2025_12
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 9. agent_system_metrics_2026_01 (has tenant_id)
DROP POLICY IF EXISTS "Users can view agent system metrics in their tenant" ON agent_system_metrics_2026_01;
DROP POLICY IF EXISTS "agent_system_metrics_2026_01_select_active_tenant" ON agent_system_metrics_2026_01;
CREATE POLICY "agent_system_metrics_2026_01_select_active_tenant" ON agent_system_metrics_2026_01
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 10. agent_system_metrics_partitioned (has tenant_id)
DROP POLICY IF EXISTS "Users can view agent system metrics in their tenant" ON agent_system_metrics_partitioned;
DROP POLICY IF EXISTS "agent_system_metrics_partitioned_select_active_tenant" ON agent_system_metrics_partitioned;
CREATE POLICY "agent_system_metrics_partitioned_select_active_tenant" ON agent_system_metrics_partitioned
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- === SECURITY TABLES ===

-- 11. security_events (has tenant_id) - SELECT
DROP POLICY IF EXISTS "Admins can view security events for their tenant" ON security_events;
DROP POLICY IF EXISTS "security_events_select_active_tenant" ON security_events;
CREATE POLICY "security_events_select_active_tenant" ON security_events
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 12. security_events (has tenant_id) - INSERT
DROP POLICY IF EXISTS "System can insert security events" ON security_events;
DROP POLICY IF EXISTS "security_events_insert_active_tenant" ON security_events;
CREATE POLICY "security_events_insert_active_tenant" ON security_events
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 13. security_policies (has tenant_id)
DROP POLICY IF EXISTS "Admins can manage security policies for their tenant" ON security_policies;
DROP POLICY IF EXISTS "security_policies_all_active_tenant" ON security_policies;
CREATE POLICY "security_policies_all_active_tenant" ON security_policies
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 14. security_policy_rules (NO tenant_id - via security_policies) - ALL
DROP POLICY IF EXISTS "Admins can manage rules for their policies" ON security_policy_rules;
DROP POLICY IF EXISTS "security_policy_rules_all_active_tenant" ON security_policy_rules;
CREATE POLICY "security_policy_rules_all_active_tenant" ON security_policy_rules
FOR ALL USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM security_policies sp
    WHERE sp.id = security_policy_rules.policy_id
    AND (sp.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 15. security_policy_rules (NO tenant_id - via security_policies) - SELECT
DROP POLICY IF EXISTS "Users can view rules for their tenant policies" ON security_policy_rules;
DROP POLICY IF EXISTS "security_policy_rules_select_active_tenant" ON security_policy_rules;
CREATE POLICY "security_policy_rules_select_active_tenant" ON security_policy_rules
FOR SELECT USING (
  get_active_tenant_id() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM security_policies sp
    WHERE sp.id = security_policy_rules.policy_id
    AND (sp.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  )
);

-- 16. security_reports (has tenant_id)
DROP POLICY IF EXISTS "Admins can view security reports for their tenant" ON security_reports;
DROP POLICY IF EXISTS "security_reports_select_active_tenant" ON security_reports;
CREATE POLICY "security_reports_select_active_tenant" ON security_reports
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- === NOTIFICATION TABLES ===

-- 17. notification_channels (has tenant_id)
DROP POLICY IF EXISTS "Admins can manage notification channels for their tenant" ON notification_channels;
DROP POLICY IF EXISTS "notification_channels_all_active_tenant" ON notification_channels;
CREATE POLICY "notification_channels_all_active_tenant" ON notification_channels
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 18. notification_log (has tenant_id)
DROP POLICY IF EXISTS "Users can view notification logs for their tenant" ON notification_log;
DROP POLICY IF EXISTS "notification_log_select_active_tenant" ON notification_log;
CREATE POLICY "notification_log_select_active_tenant" ON notification_log
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 19. notification_preferences (has tenant_id)
DROP POLICY IF EXISTS "Users can manage their notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_all_active_tenant" ON notification_preferences;
CREATE POLICY "notification_preferences_all_active_tenant" ON notification_preferences
FOR ALL USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 20. notification_queue (has tenant_id) - SELECT
DROP POLICY IF EXISTS "Admins can view notification queue for their tenant" ON notification_queue;
DROP POLICY IF EXISTS "notification_queue_select_active_tenant" ON notification_queue;
CREATE POLICY "notification_queue_select_active_tenant" ON notification_queue
FOR SELECT USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 21. notification_queue (has tenant_id) - INSERT
DROP POLICY IF EXISTS "System can insert notifications" ON notification_queue;
DROP POLICY IF EXISTS "notification_queue_insert_active_tenant" ON notification_queue;
CREATE POLICY "notification_queue_insert_active_tenant" ON notification_queue
FOR INSERT WITH CHECK (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- 22. notification_queue (has tenant_id) - UPDATE
DROP POLICY IF EXISTS "System can update notifications" ON notification_queue;
DROP POLICY IF EXISTS "notification_queue_update_active_tenant" ON notification_queue;
CREATE POLICY "notification_queue_update_active_tenant" ON notification_queue
FOR UPDATE USING (
  (get_active_tenant_id() IS NOT NULL AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);
