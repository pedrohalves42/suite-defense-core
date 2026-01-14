-- =============================================================================
-- Recreate views that were dropped by CASCADE
-- =============================================================================

-- v_tenant_plan_status - tenant plan information
CREATE OR REPLACE VIEW public.v_tenant_plan_status
WITH (security_invoker = true) AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  t.slug,
  t.created_at,
  t.setup_completed,
  t.auto_action_mode,
  t.mfa_policy,
  (SELECT COUNT(*) FROM public.agents a WHERE a.tenant_id = t.id AND a.status = 'active') AS active_agents,
  (SELECT COUNT(*) FROM public.user_roles ur WHERE ur.tenant_id = t.id) AS user_count
FROM public.tenants t
WHERE (
  t.id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

COMMENT ON VIEW public.v_tenant_plan_status IS 
'Tenant overview with agent and user counts. Tenant-filtered per ADR-024.';

-- v_system_operations_summary - operational metrics summary
CREATE OR REPLACE VIEW public.v_system_operations_summary
WITH (security_invoker = true) AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  (SELECT COUNT(*) FROM public.agents a WHERE a.tenant_id = t.id AND a.status = 'active') AS active_agents,
  (SELECT COUNT(*) FROM public.agents a WHERE a.tenant_id = t.id AND a.status = 'offline') AS offline_agents,
  (SELECT COUNT(*) FROM public.jobs j WHERE j.tenant_id = t.id AND j.status = 'pending') AS pending_jobs,
  (SELECT COUNT(*) FROM public.jobs j WHERE j.tenant_id = t.id AND j.status = 'running') AS running_jobs,
  (SELECT COUNT(*) FROM public.jobs j WHERE j.tenant_id = t.id AND j.status = 'completed' 
    AND j.completed_at > NOW() - INTERVAL '24 hours') AS jobs_completed_24h,
  (SELECT COUNT(*) FROM public.jobs j WHERE j.tenant_id = t.id AND j.status = 'failed' 
    AND j.finished_at > NOW() - INTERVAL '24 hours') AS jobs_failed_24h,
  (SELECT COUNT(*) FROM public.failed_jobs_dlq d WHERE d.tenant_id = t.id AND d.status = 'pending') AS dlq_pending,
  (SELECT COUNT(*) FROM public.scheduled_jobs sj WHERE sj.tenant_id = t.id AND sj.enabled = true) AS active_crons
FROM public.tenants t
WHERE (
  t.id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

COMMENT ON VIEW public.v_system_operations_summary IS 
'System operations dashboard summary. Tenant-filtered per ADR-024.';

-- v_action_center - pending actions requiring attention
CREATE OR REPLACE VIEW public.v_action_center
WITH (security_invoker = true) AS
SELECT 
  'pending_approval' AS action_type,
  j.id AS resource_id,
  j.type AS resource_type,
  j.created_at,
  j.tenant_id,
  j.agent_name,
  j.payload::text AS details
FROM public.jobs j
WHERE j.status = 'pending' 
  AND j.approved = false
  AND (
    j.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
UNION ALL
SELECT 
  'dlq_attention' AS action_type,
  d.id AS resource_id,
  d.job_type AS resource_type,
  d.created_at,
  d.tenant_id,
  d.original_job_id::text AS agent_name,
  d.error_message AS details
FROM public.failed_jobs_dlq d
WHERE d.status = 'pending'
  AND (
    d.tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
ORDER BY created_at DESC
LIMIT 100;

COMMENT ON VIEW public.v_action_center IS 
'Consolidated action center for pending approvals and DLQ items. Tenant-filtered per ADR-024.';