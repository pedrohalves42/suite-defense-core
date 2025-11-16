-- ============================================================================
-- P0 FIX: Configure *_safe views to inherit RLS from base tables
-- ============================================================================
-- CRITICAL SECURITY: These views currently use SECURITY DEFINER (run as owner),
-- bypassing RLS. We change them to SECURITY INVOKER (run as caller) so they
-- respect RLS policies from the underlying tables (agents, audit_logs, enrollment_keys).

-- 1. agents_safe view - change to security_invoker
DROP VIEW IF EXISTS public.agents_safe;
CREATE VIEW public.agents_safe WITH (security_invoker = true) AS
  SELECT 
    id,
    tenant_id,
    enrolled_at,
    last_heartbeat,
    agent_name,
    status,
    payload_hash,
    os_type,
    os_version,
    hostname,
    agent_version
  FROM public.agents;

COMMENT ON VIEW public.agents_safe IS 'P0 FIX: Uses security_invoker to inherit RLS from agents table, preventing cross-tenant leakage';

-- 2. audit_logs_safe view - change to security_invoker and mask sensitive data
DROP VIEW IF EXISTS public.audit_logs_safe;
CREATE VIEW public.audit_logs_safe WITH (security_invoker = true) AS
  SELECT 
    id,
    created_at,
    tenant_id,
    success,
    details,
    action,
    resource_type,
    resource_id,
    -- Mask IP address (show only first 2 octets)
    CASE 
      WHEN ip_address IS NOT NULL THEN 
        split_part(ip_address, '.', 1) || '.' || 
        split_part(ip_address, '.', 2) || '.xxx.xxx'
      ELSE NULL
    END as ip_address_masked,
    user_agent
  FROM public.audit_logs;

COMMENT ON VIEW public.audit_logs_safe IS 'P0 FIX: Uses security_invoker to inherit RLS from audit_logs table';

-- 3. enrollment_keys_safe view - change to security_invoker and mask key
DROP VIEW IF EXISTS public.enrollment_keys_safe;
CREATE VIEW public.enrollment_keys_safe WITH (security_invoker = true) AS
  SELECT 
    id,
    tenant_id,
    created_by,
    created_at,
    expires_at,
    used_at,
    is_active,
    max_uses,
    current_uses,
    agent_id,
    installer_size_bytes,
    installer_generated_at,
    expiration_notified_at,
    description,
    used_by_agent,
    installer_sha256,
    -- Mask enrollment key (show only first 8 chars)
    CASE 
      WHEN key IS NOT NULL THEN substring(key from 1 for 8) || '...' || substring(key from length(key)-3 for 4)
      ELSE NULL
    END as key_masked,
    -- Full key available (for authorized use via RLS)
    key as key_full
  FROM public.enrollment_keys;

COMMENT ON VIEW public.enrollment_keys_safe IS 'P0 FIX: Uses security_invoker to inherit RLS from enrollment_keys table';

-- Verify that base tables have proper RLS policies
-- (agents, audit_logs, enrollment_keys already have RLS enabled + policies from previous migrations)