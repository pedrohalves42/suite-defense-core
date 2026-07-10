-- P0-01 · cross-tenant probe executed server-side by
-- supabase/functions/admin-run-cross-tenant-probe/index.ts
-- Generated at: 2026-07-10T12:22:38.543Z
-- Tenant A: 9860347a-649a-4f31-85a4-35177e52e7b9
-- Tenant B: 139102fa-5af3-4580-b306-709be6275c95
-- Total probes: 88  Clean (0 rows via RLS): 82  Leaked: 0  Errored (grant-blocked): 6

-- === A_sees_B (authenticated user of that tenant queries the other tenant's rows) ===
-- A_sees_B
SELECT count(*) FROM public.agent_builds WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.agent_disk_metrics WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.agent_evidence_logs WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.agent_network_info WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.agent_rollback_events WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.agent_safe_mode_events WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.agent_web_activity WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.agents WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.ai_action_logs WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.ai_action_validations WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.ai_insights WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.anomaly_events WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.antivirus_status WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.api_keys WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.api_request_logs WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.audit_reason_trees WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.blocked_websites WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.compliance_policies WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.custom_trials WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.enrollment_keys WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.failed_login_attempts WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.governance_reports WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.jobs WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.playbook_executions WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.policy_assignments WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.quarantined_files WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.report_executions WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.reports WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.scheduled_jobs WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.security_logs WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.security_policies WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.soc2_controls WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.soc2_criteria WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.software_inventory WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.system_alerts WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.tasks WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.tenant_action_policies WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.tenant_features WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.tenant_settings WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.tenant_subscriptions WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.user_roles WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.vendor_risk_registry WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.virus_scans WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- A_sees_B
SELECT count(*) FROM public.vuln_findings WHERE tenant_id = '139102fa-5af3-4580-b306-709be6275c95'; -- expected: 0
-- === B_sees_A (authenticated user of that tenant queries the other tenant's rows) ===
-- B_sees_A
SELECT count(*) FROM public.agent_builds WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.agent_disk_metrics WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.agent_evidence_logs WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.agent_network_info WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.agent_rollback_events WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.agent_safe_mode_events WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.agent_web_activity WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.agents WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.ai_action_logs WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.ai_action_validations WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.ai_insights WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.anomaly_events WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.antivirus_status WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.api_keys WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.api_request_logs WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.audit_reason_trees WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.blocked_websites WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.compliance_policies WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.custom_trials WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.enrollment_keys WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.failed_login_attempts WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.governance_reports WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.jobs WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.playbook_executions WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.policy_assignments WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.quarantined_files WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.report_executions WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.reports WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.scheduled_jobs WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.security_logs WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.security_policies WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.soc2_controls WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.soc2_criteria WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.software_inventory WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.system_alerts WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.tasks WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.tenant_action_policies WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.tenant_features WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.tenant_settings WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.tenant_subscriptions WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.user_roles WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.vendor_risk_registry WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.virus_scans WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
-- B_sees_A
SELECT count(*) FROM public.vuln_findings WHERE tenant_id = '9860347a-649a-4f31-85a4-35177e52e7b9'; -- expected: 0
