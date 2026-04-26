-- =============================================================================
-- RLS Hardening Phase 5: Critical Fix - Views with Tenant Filtering
-- =============================================================================

-- Drop and recreate hmac_agent_secrets as a SECURITY INVOKER view
DROP VIEW IF EXISTS public.hmac_agent_secrets;

CREATE VIEW public.hmac_agent_secrets
WITH (security_invoker = true) AS
SELECT 
  a.id AS agent_id,
  a.hmac_secret,
  a.tenant_id
FROM public.agents a
WHERE a.status = 'active'
  AND a.hmac_secret IS NOT NULL
  AND public.is_current_super_admin();

COMMENT ON VIEW public.hmac_agent_secrets IS 
'Secure view for HMAC secrets - accessible only to super_admin. ADR-023/024 compliant.';

-- =============================================================================
-- Phase 5.1: Fix agents_public view - add tenant filtering
-- =============================================================================
DROP VIEW IF EXISTS public.agents_public CASCADE;

CREATE VIEW public.agents_public
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, agent_name, hostname, status, os_type, os_version, 
  agent_version, display_name, enrolled_at, last_heartbeat,
  agent_mode, agent_state, agent_state_reason, agent_state_changed_at
FROM public.agents
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

COMMENT ON VIEW public.agents_public IS 
'Public-safe view of agents excluding hmac_secret. Tenant-filtered per ADR-023.';

-- =============================================================================
-- Phase 5.2: Fix agents_safe view - add tenant filtering  
-- =============================================================================
DROP VIEW IF EXISTS public.agents_safe CASCADE;

CREATE VIEW public.agents_safe
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, agent_name, hostname, status, os_type, os_version, 
  agent_version, display_name, enrolled_at, last_heartbeat,
  agent_mode, agent_state, agent_state_reason, agent_state_changed_at,
  safe_mode_reason, safe_mode_entered_at, is_throttled, throttled_at,
  is_isolated, isolated_at, isolation_reason, archived_at, archived_reason
FROM public.agents
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

COMMENT ON VIEW public.agents_safe IS 
'Safe view of agents excluding hmac_secret. Tenant-filtered per ADR-023.';

-- =============================================================================
-- Phase 5.3: Fix active_agents view - add tenant filtering
-- =============================================================================
DROP VIEW IF EXISTS public.active_agents CASCADE;

CREATE VIEW public.active_agents
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, agent_name, hostname, status, os_type, os_version, 
  agent_version, display_name, enrolled_at, last_heartbeat,
  agent_mode, agent_state, agent_state_reason
FROM public.agents
WHERE status = 'active'
  AND (
    tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

COMMENT ON VIEW public.active_agents IS 
'Active agents only, tenant-filtered. Excludes hmac_secret per ADR-023.';

-- =============================================================================
-- Phase 5.4: Fix enrollment_keys_safe view - add tenant filtering
-- =============================================================================
DROP VIEW IF EXISTS public.enrollment_keys_safe CASCADE;

CREATE VIEW public.enrollment_keys_safe
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, description, expires_at, max_uses, current_uses,
  is_active, created_at, created_by, agent_id, auto_generated
FROM public.enrollment_keys
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

COMMENT ON VIEW public.enrollment_keys_safe IS 
'Safe view of enrollment keys excluding tokens. Tenant-filtered per ADR-023.';

-- =============================================================================
-- Phase 5.5: Fix invites_safe view - add tenant filtering  
-- =============================================================================
DROP VIEW IF EXISTS public.invites_safe CASCADE;

CREATE VIEW public.invites_safe
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, email, role, invited_by, created_at, 
  expires_at, accepted_at, status
FROM public.invites
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

COMMENT ON VIEW public.invites_safe IS 
'Safe view of invites excluding tokens. Tenant-filtered per ADR-023.';

-- =============================================================================
-- Phase 5.6: Fix audit_logs_safe view - add tenant filtering
-- =============================================================================
DROP VIEW IF EXISTS public.audit_logs_safe CASCADE;

CREATE VIEW public.audit_logs_safe
WITH (security_invoker = true) AS
SELECT 
  id, tenant_id, user_id, action, resource_type, resource_id,
  details, ip_address, user_agent, created_at, success, actor_id,
  request_id
FROM public.audit_logs
WHERE (
  tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  OR public.is_current_super_admin()
);

COMMENT ON VIEW public.audit_logs_safe IS 
'Audit logs view with tenant isolation per ADR-023.';