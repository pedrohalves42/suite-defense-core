
-- ============================================================
-- Propagate RLS policies to all 80 partitions missing them
-- ============================================================

-- ========================
-- AUDIT_LOGS partitions (34 partitions)
-- Parent policies: service_role ALL, service_role INSERT, authenticated SELECT (tenant scoped)
-- ========================
DO $$
DECLARE
  partition_name TEXT;
BEGIN
  FOR partition_name IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND p.relname = 'audit_logs'
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
  LOOP
    EXECUTE format('CREATE POLICY "audit_logs_all_service_role" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', partition_name);
    EXECUTE format('CREATE POLICY "audit_logs_insert_service_role" ON public.%I FOR INSERT TO service_role WITH CHECK (true)', partition_name);
    EXECUTE format('CREATE POLICY "audit_logs_select_authenticated" ON public.%I FOR SELECT TO authenticated USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin())', partition_name);
  END LOOP;
END $$;

-- ========================
-- JOB_EXECUTIONS partitions (30 partitions)
-- Parent policies: super_admin SELECT, tenant SELECT, service_role INSERT, service_role UPDATE
-- ========================
DO $$
DECLARE
  partition_name TEXT;
BEGIN
  FOR partition_name IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND p.relname = 'job_executions'
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
  LOOP
    EXECUTE format('CREATE POLICY "super_admins_select" ON public.%I FOR SELECT TO authenticated USING (has_role(auth.uid(), ''super_admin''::app_role))', partition_name);
    EXECUTE format('CREATE POLICY "job_executions_select_active_tenant" ON public.%I FOR SELECT TO authenticated USING (((get_active_tenant_id() IS NOT NULL) AND (tenant_id = get_active_tenant_id())) OR is_current_super_admin())', partition_name);
    EXECUTE format('CREATE POLICY "service_role_insert_job_executions" ON public.%I FOR INSERT TO service_role WITH CHECK (true)', partition_name);
    EXECUTE format('CREATE POLICY "service_role_update_job_executions" ON public.%I FOR UPDATE TO service_role USING (true) WITH CHECK (true)', partition_name);
  END LOOP;
END $$;

-- ========================
-- ENDPOINT_EVENT_BUFFER_PARTITIONED partitions (4 partitions)
-- Parent policies: authenticated SELECT (tenant TEXT), service_role ALL
-- Note: tenant_id is TEXT type in this table
-- ========================
DO $$
DECLARE
  partition_name TEXT;
BEGIN
  FOR partition_name IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND p.relname = 'endpoint_event_buffer_partitioned'
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
  LOOP
    EXECUTE format('CREATE POLICY "authenticated_select_tenant" ON public.%I FOR SELECT TO authenticated USING ((tenant_id = (get_active_tenant_id())::text) OR is_current_super_admin())', partition_name);
    EXECUTE format('CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', partition_name);
  END LOOP;
END $$;

-- ========================
-- ENDPOINT_NETWORK_EVENTS_PARTITIONED partitions (4 partitions)
-- ========================
DO $$
DECLARE
  partition_name TEXT;
BEGIN
  FOR partition_name IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND p.relname = 'endpoint_network_events_partitioned'
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
  LOOP
    EXECUTE format('CREATE POLICY "authenticated_select_tenant" ON public.%I FOR SELECT TO authenticated USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin())', partition_name);
    EXECUTE format('CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', partition_name);
  END LOOP;
END $$;

-- ========================
-- ENDPOINT_PROCESS_EVENTS_PARTITIONED partitions (4 partitions)
-- ========================
DO $$
DECLARE
  partition_name TEXT;
BEGIN
  FOR partition_name IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
      AND p.relname = 'endpoint_process_events_partitioned'
      AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
  LOOP
    EXECUTE format('CREATE POLICY "authenticated_select_tenant" ON public.%I FOR SELECT TO authenticated USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin())', partition_name);
    EXECUTE format('CREATE POLICY "service_role_full_access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', partition_name);
  END LOOP;
END $$;

-- ========================
-- Update ensure_partition_rls() to also propagate policies for future partitions
-- ========================
CREATE OR REPLACE FUNCTION public.ensure_partition_rls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  parent_name TEXT;
  pol RECORD;
BEGIN
  FOR rec IN
    SELECT c.relname AS partition_name, c.oid AS partition_oid, p.relname AS parent_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r'
  LOOP
    -- Enable RLS if not already
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = rec.partition_oid) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.partition_name);
    END IF;

    -- Propagate policies from parent if partition has none
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = rec.partition_oid) THEN
      FOR pol IN
        SELECT polname, polcmd, polroles, polpermissive, polqual, polwithcheck
        FROM pg_policy
        WHERE polrelid = (SELECT oid FROM pg_class WHERE relname = rec.parent_name AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
      LOOP
        DECLARE
          cmd_text TEXT;
          roles_text TEXT;
          using_clause TEXT := '';
          check_clause TEXT := '';
          permissive_text TEXT;
        BEGIN
          cmd_text := CASE pol.polcmd
            WHEN 'r' THEN 'SELECT'
            WHEN 'a' THEN 'INSERT'
            WHEN 'w' THEN 'UPDATE'
            WHEN 'd' THEN 'DELETE'
            WHEN '*' THEN 'ALL'
          END;

          SELECT string_agg(rolname, ', ')
          INTO roles_text
          FROM pg_roles
          WHERE oid = ANY(pol.polroles);

          permissive_text := CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

          IF pol.polqual IS NOT NULL THEN
            using_clause := format(' USING (%s)', pg_get_expr(pol.polqual, rec.partition_oid, true));
          END IF;

          IF pol.polwithcheck IS NOT NULL THEN
            check_clause := format(' WITH CHECK (%s)', pg_get_expr(pol.polwithcheck, rec.partition_oid, true));
          END IF;

          EXECUTE format(
            'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
            pol.polname, rec.partition_name, permissive_text, cmd_text, roles_text, using_clause, check_clause
          );
        EXCEPTION WHEN duplicate_object THEN
          NULL; -- Policy already exists, skip
        END;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
