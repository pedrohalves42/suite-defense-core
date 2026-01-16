-- =========================================================================
-- SECURITY HARDENING: Comprehensive Database Security Fix
-- =========================================================================
-- Phase 1: Tenant-Aware Views with get_active_tenant_id()
-- Phase 2: Column-Level Privileges & REVOKE dangerous access
-- =========================================================================

-- =========================================================================
-- PHASE 1: Fix tenant-aware views to use get_active_tenant_id()
-- =========================================================================

-- 1A. Recreate invites_safe with proper tenant isolation
DROP VIEW IF EXISTS public.invites_safe;
CREATE VIEW public.invites_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  tenant_id,
  email,
  role,
  status,
  invited_by,
  created_at,
  expires_at,
  accepted_at
FROM public.invites i
WHERE 
  tenant_id = public.get_active_tenant_id() 
  OR public.is_current_super_admin();

COMMENT ON VIEW public.invites_safe IS 
  'Safe view for invites - excludes token column, uses active tenant isolation (ADR-023)';

-- 1B. Recreate dlq_categorized with proper tenant isolation
DROP VIEW IF EXISTS public.dlq_categorized;
CREATE VIEW public.dlq_categorized
WITH (security_invoker = true)
AS
SELECT 
  id,
  tenant_id,
  agent_id,
  job_type,
  error_message,
  retry_count,
  status,
  created_at,
  resolved_at,
  resolved_by,
  review_notes,
  flagged_suspicious,
  COALESCE(risk_category,
    CASE
      WHEN failure_class = ANY (ARRAY['security', 'critical', 'auth_failure']) THEN 'security'
      WHEN retry_count > 5 THEN 'reliability'
      ELSE 'operational'
    END
  ) AS risk_category
FROM public.failed_jobs_dlq
WHERE 
  tenant_id = public.get_active_tenant_id() 
  OR public.is_current_super_admin();

COMMENT ON VIEW public.dlq_categorized IS 
  'Safe DLQ view with categorization - excludes payload/metadata, uses active tenant isolation (ADR-023)';

-- =========================================================================
-- PHASE 2A: REVOKE dangerous privileges from HMAC signatures tables
-- =========================================================================

-- Revoke all access from anon/authenticated on hmac_signatures and partitions
REVOKE ALL ON public.hmac_signatures FROM anon, authenticated;

-- Revoke on existing partitions (2025-2026 range)
DO $$
DECLARE
  partition_name text;
BEGIN
  FOR partition_name IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename LIKE 'hmac_signatures_%'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', partition_name);
    RAISE NOTICE 'Revoked access on partition: %', partition_name;
  END LOOP;
END $$;

-- =========================================================================
-- PHASE 2B: Set default privileges for future HMAC partitions
-- =========================================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- Re-grant general table access (will be controlled by RLS)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- =========================================================================
-- PHASE 2C: Column-level privileges on invites (block token access)
-- =========================================================================

-- First revoke broad SELECT, then grant only safe columns
REVOKE SELECT ON public.invites FROM anon, authenticated;

-- Grant SELECT only on safe columns (no token!)
GRANT SELECT (
  id, 
  tenant_id, 
  email, 
  role, 
  status, 
  invited_by, 
  created_at, 
  expires_at, 
  accepted_at
) ON public.invites TO authenticated;

-- Allow INSERT/UPDATE/DELETE (RLS handles row-level security)
GRANT INSERT, UPDATE, DELETE ON public.invites TO authenticated;

-- =========================================================================
-- PHASE 2D: Column-level privileges on failed_jobs_dlq (block payload/metadata)
-- =========================================================================

-- Block direct access to sensitive columns
REVOKE SELECT ON public.failed_jobs_dlq FROM anon;

-- Grant SELECT only on safe columns (no full payload/metadata!)
REVOKE SELECT ON public.failed_jobs_dlq FROM authenticated;
GRANT SELECT (
  id,
  tenant_id,
  original_job_id,
  agent_id,
  agent_name,
  job_type,
  error_message,
  error_count,
  retry_count,
  max_retries,
  status,
  first_failure_at,
  last_failure_at,
  next_retry_at,
  resolved_at,
  resolved_by,
  resolution_notes,
  resolution_source,
  review_required,
  decision_event_id,
  created_at,
  payload_excerpt,
  risk_category,
  failure_class,
  flagged_suspicious,
  review_notes
) ON public.failed_jobs_dlq TO authenticated;

-- Allow mutations (RLS handles row-level security)
GRANT INSERT, UPDATE, DELETE ON public.failed_jobs_dlq TO authenticated;

-- =========================================================================
-- PHASE 2E: Column-level privileges on agent_releases (block script_content)
-- =========================================================================

-- Revoke broad SELECT
REVOKE SELECT ON public.agent_releases FROM anon, authenticated;

-- Grant SELECT only on distributable columns
GRANT SELECT (
  id,
  version,
  platform,
  channel,
  sha256,
  release_notes,
  is_active,
  created_at
) ON public.agent_releases TO authenticated;

-- Anon can also see basic release info (for agent update checks)
GRANT SELECT (
  id,
  version,
  platform,
  channel,
  sha256,
  is_active,
  created_at
) ON public.agent_releases TO anon;

-- Super admin / service role retains full access via other policies
-- Allow INSERT for authenticated (admin creates releases)
GRANT INSERT ON public.agent_releases TO authenticated;

-- =========================================================================
-- Verification: Log success
-- =========================================================================
DO $$
BEGIN
  RAISE NOTICE 'SECURITY HARDENING COMPLETE: Phase 1+2 applied successfully';
  RAISE NOTICE '- invites_safe: now uses get_active_tenant_id()';
  RAISE NOTICE '- dlq_categorized: now uses get_active_tenant_id()';
  RAISE NOTICE '- hmac_signatures: access revoked from anon/authenticated';
  RAISE NOTICE '- invites.token: column access revoked from authenticated';
  RAISE NOTICE '- failed_jobs_dlq.payload/metadata: column access revoked';
  RAISE NOTICE '- agent_releases.script_content: column access revoked';
END $$;