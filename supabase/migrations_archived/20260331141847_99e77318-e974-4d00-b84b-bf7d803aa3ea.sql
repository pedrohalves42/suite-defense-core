
-- =============================================================================
-- Migration: Enable RLS + Policies on 12 Partitioned Telemetry Tables
-- Fixes: Cross-tenant data leak risk on partitions without RLS
-- Ref: ADR-023, ADR-026, memory/security/partitioned-table-rls-enforcement-standard
-- =============================================================================

-- =============================================
-- PHASE 1: Enable RLS on all 12 partitions
-- =============================================

-- endpoint_event_buffer_partitioned partitions (tenant_id is TEXT)
ALTER TABLE public.endpoint_event_buffer_partitioned_2026_03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_event_buffer_partitioned_2026_04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_event_buffer_partitioned_2026_05 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_event_buffer_partitioned_2026_06 ENABLE ROW LEVEL SECURITY;

-- endpoint_network_events_partitioned partitions (tenant_id is UUID)
ALTER TABLE public.endpoint_network_events_partitioned_2026_03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_network_events_partitioned_2026_04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_network_events_partitioned_2026_05 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_network_events_partitioned_2026_06 ENABLE ROW LEVEL SECURITY;

-- endpoint_process_events_partitioned partitions (tenant_id is UUID)
ALTER TABLE public.endpoint_process_events_partitioned_2026_03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_process_events_partitioned_2026_04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_process_events_partitioned_2026_05 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_process_events_partitioned_2026_06 ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PHASE 2: Fix parent table policies (ADR-023)
-- Replace dangerous public ALL USING(true) with service_role
-- =============================================

-- endpoint_event_buffer_partitioned
DROP POLICY IF EXISTS "service_role_full_access" ON public.endpoint_event_buffer_partitioned;
CREATE POLICY "service_role_full_access" ON public.endpoint_event_buffer_partitioned
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_tenant" ON public.endpoint_event_buffer_partitioned
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id()::text OR is_current_super_admin());

-- endpoint_network_events_partitioned
DROP POLICY IF EXISTS "service_role_full_access" ON public.endpoint_network_events_partitioned;
CREATE POLICY "service_role_full_access" ON public.endpoint_network_events_partitioned
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_tenant" ON public.endpoint_network_events_partitioned
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- endpoint_process_events_partitioned
DROP POLICY IF EXISTS "service_role_full_access" ON public.endpoint_process_events_partitioned;
CREATE POLICY "service_role_full_access" ON public.endpoint_process_events_partitioned
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_tenant" ON public.endpoint_process_events_partitioned
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- =============================================
-- PHASE 3: Create reusable function for future partitions
-- Ensures new partitions auto-inherit RLS during maintenance
-- =============================================

CREATE OR REPLACE FUNCTION public.ensure_partition_rls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT pt.oid, pt.relname AS partition_name, parent.relname AS parent_name
    FROM pg_inherits i
    JOIN pg_class pt ON pt.oid = i.inhrelid
    JOIN pg_class parent ON parent.oid = i.inhparent
    WHERE pt.relnamespace = 'public'::regnamespace
      AND pt.relkind = 'r'
      AND pt.relrowsecurity = false
      AND parent.relname IN (
        'endpoint_event_buffer_partitioned',
        'endpoint_network_events_partitioned',
        'endpoint_process_events_partitioned',
        'agent_system_metrics_partitioned',
        'audit_logs',
        'hmac_signatures',
        'job_executions'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.partition_name);
    RAISE NOTICE 'Enabled RLS on partition: %', rec.partition_name;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.ensure_partition_rls() IS 
  'Ensures all partitions of critical telemetry tables have RLS enabled. Run after creating new partitions. Ref: ADR-026.';
