
-- =============================================================================
-- ZERO-GAP Phase 1+2: Critical FK constraints + security_barrier on views
-- =============================================================================

-- ─── PHASE 1: Add FK tenant_id → tenants(id) on critical tables ───────────
-- Only add where FK doesn't already exist
-- Using DO block to skip if FK already exists

DO $$
DECLARE
  tables_to_fix text[] := ARRAY[
    'agents', 'jobs', 'job_executions', 'tasks', 'system_alerts',
    'security_logs', 'audit_logs', 'automation_rules', 'automation_executions',
    'automation_execution_log', 'domain_events', 'failed_jobs_dlq',
    'notification_queue', 'notification_log', 'scheduled_jobs',
    'scheduled_job_runs', 'software_inventory', 'playbook_executions',
    'incident_timelines', 'feature_flags'
  ];
  tbl text;
  fk_name text;
BEGIN
  FOREACH tbl IN ARRAY tables_to_fix LOOP
    fk_name := tbl || '_tenant_id_fkey';
    
    -- Skip if FK already exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = fk_name
      AND table_schema = 'public'
    ) THEN
      -- Check table and column exist
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)',
          tbl, fk_name
        );
        RAISE NOTICE 'Added FK % on %', fk_name, tbl;
      END IF;
    ELSE
      RAISE NOTICE 'FK % already exists, skipping', fk_name;
    END IF;
  END LOOP;
END $$;

-- ─── PHASE 2: Add security_barrier to sensitive views ─────────────────────
-- Recreate views with security_barrier=true for critical data views

-- agents_safe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'agents_safe') THEN
    EXECUTE (
      SELECT format(
        'CREATE OR REPLACE VIEW public.agents_safe WITH (security_invoker=on, security_barrier=true) AS %s',
        view_definition
      )
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'agents_safe'
    );
    RAISE NOTICE 'agents_safe: security_barrier=true applied';
  END IF;
END $$;

-- agents_public  
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'agents_public') THEN
    EXECUTE (
      SELECT format(
        'CREATE OR REPLACE VIEW public.agents_public WITH (security_invoker=on, security_barrier=true) AS %s',
        view_definition
      )
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'agents_public'
    );
    RAISE NOTICE 'agents_public: security_barrier=true applied';
  END IF;
END $$;

-- enrollment_keys_safe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'enrollment_keys_safe') THEN
    EXECUTE (
      SELECT format(
        'CREATE OR REPLACE VIEW public.enrollment_keys_safe WITH (security_invoker=on, security_barrier=true) AS %s',
        view_definition
      )
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'enrollment_keys_safe'
    );
    RAISE NOTICE 'enrollment_keys_safe: security_barrier=true applied';
  END IF;
END $$;

-- audit_logs_safe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'audit_logs_safe') THEN
    EXECUTE (
      SELECT format(
        'CREATE OR REPLACE VIEW public.audit_logs_safe WITH (security_invoker=on, security_barrier=true) AS %s',
        view_definition
      )
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'audit_logs_safe'
    );
    RAISE NOTICE 'audit_logs_safe: security_barrier=true applied';
  END IF;
END $$;

-- hmac_agent_secrets
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'hmac_agent_secrets') THEN
    EXECUTE (
      SELECT format(
        'CREATE OR REPLACE VIEW public.hmac_agent_secrets WITH (security_invoker=on, security_barrier=true) AS %s',
        view_definition
      )
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'hmac_agent_secrets'
    );
    RAISE NOTICE 'hmac_agent_secrets: security_barrier=true applied';
  END IF;
END $$;

-- invites_safe
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'invites_safe') THEN
    EXECUTE (
      SELECT format(
        'CREATE OR REPLACE VIEW public.invites_safe WITH (security_invoker=on, security_barrier=true) AS %s',
        view_definition
      )
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'invites_safe'
    );
    RAISE NOTICE 'invites_safe: security_barrier=true applied';
  END IF;
END $$;

-- ─── Add status column to cron_health if missing ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cron_health' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.cron_health ADD COLUMN status text 
      GENERATED ALWAYS AS (
        CASE 
          WHEN consecutive_failures >= 3 THEN 'critical'
          WHEN consecutive_failures >= 1 THEN 'degraded'
          ELSE 'healthy'
        END
      ) STORED;
    RAISE NOTICE 'cron_health.status column added';
  END IF;
END $$;
