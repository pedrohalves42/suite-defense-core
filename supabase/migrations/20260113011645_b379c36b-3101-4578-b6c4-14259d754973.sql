-- =============================================================================
-- Phase 3.1: Clean up conflicting RLS policies on security_logs
-- =============================================================================
-- Remove old "No one can..." policies that conflict with _active_tenant policies
-- The active_tenant policies already properly restrict access with tenant_id checks
-- =============================================================================

DROP POLICY IF EXISTS "No one can delete security logs" ON security_logs;
DROP POLICY IF EXISTS "No one can modify security logs" ON security_logs;
DROP POLICY IF EXISTS "Super admins can view all security logs" ON security_logs;

-- The remaining policies security_logs_*_active_tenant are correct and sufficient