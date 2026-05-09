-- 1. Hardening SECURITY DEFINER functions (Falha 1)
-- Revoke PUBLIC execution by default (standard Postgres/Supabase behavior is often to grant to PUBLIC)
-- This ensures that only specified roles can execute them.

-- FUNCTIONS: service_role only (Internal/Maintenance/HMAC)
DO $$
DECLARE
    service_fns text[] := ARRAY[
        'cleanup_agent_hmac_signatures()',
        'cleanup_hmac_nonces()',
        'cleanup_old_hmac_signatures()',
        'rotate_hmac_signatures()',
        'prune_old_telemetry()',
        'run_system_maintenance()',
        'enroll_agent_atomic(text, text, text, text, text, timestamp with time zone)',
        'enroll_agent_atomic(text, text, text, text, text, timestamp with time zone, text)',
        'increment_enrollment_key_usage(uuid, text)',
        'update_agent_heartbeat_atomic(uuid, jsonb)',
        'hmac_verify_signature_v2(uuid, text, jsonb, text)',
        'get_tenant_abuse_metrics(integer, integer, double precision, interval)',
        'invalidate_cache_prefix(text)'
    ];
    fn text;
BEGIN
    FOREACH fn IN ARRAY service_fns
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    END LOOP;
END $$;

-- FUNCTIONS: authenticated (Admin/Helpers)
-- These need to be callable by the frontend/API gateway under 'authenticated' role
DO $$
DECLARE
    auth_fns text[] := ARRAY[
        'diagnose_agent(text, uuid)',
        'archive_agent(uuid)',
        'log_security_violation(uuid, uuid, text, text, text, text, jsonb)',
        'has_role(uuid, text, uuid)',
        'has_role_safe(app_role)',
        'get_active_tenant_id()',
        'is_current_super_admin()'
    ];
    fn text;
BEGIN
    FOREACH fn IN ARRAY auth_fns
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
    END LOOP;
END $$;

-- 2. Corrigir policy permissiva em agent_registration_locks (Falha 2)
-- The existing policy incorrectly granted access to 'public'
DROP POLICY IF EXISTS "Service role only access to registration locks" ON public.agent_registration_locks;

-- Use a restrictive policy to ensure only service_role can access this
CREATE POLICY "agent_registration_locks_service_role_only"
  ON public.agent_registration_locks
  AS RESTRICTIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE public.agent_registration_locks ENABLE ROW LEVEL SECURITY;
