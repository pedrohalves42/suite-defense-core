-- ============================================================
-- PARTITIONING: audit_logs and job_executions
-- Safe migration with trigger/policy/index recreation
-- ============================================================

-- ============================================================
-- PART 1: Auto-partition creation function (reusable)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_monthly_partitions(
  p_table_name TEXT,
  p_partition_column TEXT,
  p_months_ahead INTEGER DEFAULT 3
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_partition_name TEXT;
  v_created INTEGER := 0;
BEGIN
  FOR i IN 0..p_months_ahead LOOP
    v_start := date_trunc('month', now()) + (i || ' months')::interval;
    v_end := v_start + '1 month'::interval;
    v_partition_name := p_table_name || '_' || to_char(v_start, 'YYYY_MM');
    
    -- Check if partition already exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.%I FOR VALUES FROM (%L) TO (%L)',
        v_partition_name, p_table_name, v_start, v_end
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;
  
  RETURN v_created;
END;
$$;

-- ============================================================
-- PART 2: AUDIT_LOGS PARTITIONING
-- ============================================================

-- 2a. Create new partitioned table
CREATE TABLE public.audit_logs_partitioned (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  tenant_id UUID NOT NULL,
  actor_id UUID,
  request_id UUID DEFAULT gen_random_uuid(),
  state_before JSONB,
  state_after JSONB,
  integrity_hash TEXT,
  previous_log_hash TEXT,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 2b. Create a default partition for historical data
CREATE TABLE public.audit_logs_default PARTITION OF public.audit_logs_partitioned DEFAULT;

-- 2c. Create monthly partitions (current + 6 months ahead)
DO $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  -- Historical partition for old data
  v_start := '2024-01-01';
  WHILE v_start < date_trunc('month', now()) LOOP
    v_end := v_start + '1 month'::interval;
    EXECUTE format(
      'CREATE TABLE public.audit_logs_%s PARTITION OF public.audit_logs_partitioned FOR VALUES FROM (%L) TO (%L)',
      to_char(v_start, 'YYYY_MM'), v_start, v_end
    );
    v_start := v_end;
  END LOOP;
  
  -- Current + future months
  v_start := date_trunc('month', now());
  FOR i IN 0..6 LOOP
    v_end := v_start + '1 month'::interval;
    BEGIN
      EXECUTE format(
        'CREATE TABLE public.audit_logs_%s PARTITION OF public.audit_logs_partitioned FOR VALUES FROM (%L) TO (%L)',
        to_char(v_start, 'YYYY_MM'), v_start, v_end
      );
    EXCEPTION WHEN duplicate_table THEN
      NULL; -- already exists from loop above
    END;
    v_start := v_end;
  END LOOP;
END $$;

-- 2d. Create indexes on partitioned table
CREATE INDEX idx_audit_logs_p_tenant_created ON public.audit_logs_partitioned (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_p_action_created ON public.audit_logs_partitioned (action, created_at DESC);
CREATE INDEX idx_audit_logs_p_actor_id ON public.audit_logs_partitioned (actor_id);
CREATE INDEX idx_audit_logs_p_created ON public.audit_logs_partitioned (created_at DESC);
CREATE INDEX idx_audit_logs_p_resource ON public.audit_logs_partitioned (resource_type, resource_id);
CREATE INDEX idx_audit_logs_p_success_created ON public.audit_logs_partitioned (success, created_at DESC);
CREATE INDEX idx_audit_logs_p_user_created ON public.audit_logs_partitioned (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_p_tenant_action ON public.audit_logs_partitioned (tenant_id, action);

-- 2e. Copy data from old table
INSERT INTO public.audit_logs_partitioned 
SELECT * FROM public.audit_logs;

-- 2f. Drop triggers on old table (they'll be recreated on new)
DROP TRIGGER IF EXISTS set_audit_logs_tenant_id ON public.audit_logs;
DROP TRIGGER IF EXISTS tr_prevent_audit_modification ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_audit_log_integrity ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;

-- 2g. Swap tables
ALTER TABLE public.audit_logs RENAME TO audit_logs_old;
ALTER TABLE public.audit_logs_partitioned RENAME TO audit_logs;

-- 2h. Recreate triggers on new partitioned table
CREATE TRIGGER set_audit_logs_tenant_id
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_from_user();

CREATE TRIGGER tr_prevent_audit_modification
  BEFORE DELETE OR UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

CREATE TRIGGER trg_audit_log_integrity
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION calculate_audit_log_hash();

CREATE TRIGGER trg_immutable_audit_logs
  BEFORE DELETE OR UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- 2i. Enable RLS on new table
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_authenticated"
  ON public.audit_logs FOR SELECT TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- 2j. Grant permissions
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- ============================================================
-- PART 3: JOB_EXECUTIONS PARTITIONING
-- ============================================================

-- 3a. Create new partitioned table
CREATE TABLE public.job_executions_partitioned (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  agent_version TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  nonce UUID NOT NULL DEFAULT gen_random_uuid(),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'claimed',
  exit_code INTEGER,
  output_hash TEXT,
  error_message TEXT,
  execution_time_seconds INTEGER,
  result_signature TEXT,
  signature_algorithm TEXT DEFAULT 'ECDSA-P256-SHA256',
  signature_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  legacy BOOLEAN DEFAULT false,
  execution_hash TEXT,
  previous_execution_hash TEXT,
  execution_index BIGINT,
  archived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 3b. Create default + monthly partitions
CREATE TABLE public.job_executions_default PARTITION OF public.job_executions_partitioned DEFAULT;

DO $$
DECLARE
  v_start DATE;
  v_end DATE;
BEGIN
  v_start := '2024-01-01';
  WHILE v_start < date_trunc('month', now()) LOOP
    v_end := v_start + '1 month'::interval;
    EXECUTE format(
      'CREATE TABLE public.job_executions_%s PARTITION OF public.job_executions_partitioned FOR VALUES FROM (%L) TO (%L)',
      to_char(v_start, 'YYYY_MM'), v_start, v_end
    );
    v_start := v_end;
  END LOOP;
  
  v_start := date_trunc('month', now());
  FOR i IN 0..6 LOOP
    v_end := v_start + '1 month'::interval;
    BEGIN
      EXECUTE format(
        'CREATE TABLE public.job_executions_%s PARTITION OF public.job_executions_partitioned FOR VALUES FROM (%L) TO (%L)',
        to_char(v_start, 'YYYY_MM'), v_start, v_end
      );
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END;
    v_start := v_end;
  END LOOP;
END $$;

-- 3c. Create indexes
CREATE INDEX idx_job_exec_p_agent_finished ON public.job_executions_partitioned (agent_id, finished_at DESC);
CREATE INDEX idx_job_exec_p_agent_id ON public.job_executions_partitioned (agent_id);
CREATE INDEX idx_job_exec_p_archive ON public.job_executions_partitioned (created_at) WHERE archived_at IS NULL;
CREATE INDEX idx_job_exec_p_created ON public.job_executions_partitioned (created_at DESC);
CREATE INDEX idx_job_exec_p_job_id ON public.job_executions_partitioned (job_id);
CREATE INDEX idx_job_exec_p_payload_hash ON public.job_executions_partitioned (payload_hash);
CREATE INDEX idx_job_exec_p_status ON public.job_executions_partitioned (status);
CREATE INDEX idx_job_exec_p_tenant_id ON public.job_executions_partitioned (tenant_id);
CREATE INDEX idx_job_exec_p_legacy ON public.job_executions_partitioned (legacy) WHERE legacy = true;

-- 3d. Copy data
INSERT INTO public.job_executions_partitioned 
SELECT * FROM public.job_executions;

-- 3e. Drop triggers on old table
DROP TRIGGER IF EXISTS block_execution_deletion ON public.job_executions;
DROP TRIGGER IF EXISTS enforce_execution_immutability ON public.job_executions;
DROP TRIGGER IF EXISTS tr_playbook_on_job_failure ON public.job_executions;
DROP TRIGGER IF EXISTS tr_prevent_execution_deletion ON public.job_executions;
DROP TRIGGER IF EXISTS trg_auto_create_evidence ON public.job_executions;
DROP TRIGGER IF EXISTS trg_auto_create_evidence_on_insert ON public.job_executions;

-- 3f. Swap tables
ALTER TABLE public.job_executions RENAME TO job_executions_old;
ALTER TABLE public.job_executions_partitioned RENAME TO job_executions;

-- 3g. Recreate triggers
CREATE TRIGGER block_execution_deletion
  BEFORE DELETE ON public.job_executions
  FOR EACH ROW EXECUTE FUNCTION prevent_execution_deletion();

CREATE TRIGGER enforce_execution_immutability
  BEFORE UPDATE ON public.job_executions
  FOR EACH ROW EXECUTE FUNCTION prevent_execution_modification();

CREATE TRIGGER tr_playbook_on_job_failure
  AFTER INSERT OR UPDATE ON public.job_executions
  FOR EACH ROW
  WHEN (NEW.status = 'failed')
  EXECUTE FUNCTION trigger_playbook_evaluation_on_job_failure();

CREATE TRIGGER tr_prevent_execution_deletion
  BEFORE DELETE ON public.job_executions
  FOR EACH ROW EXECUTE FUNCTION prevent_execution_deletion();

CREATE TRIGGER trg_auto_create_evidence
  AFTER UPDATE OF status ON public.job_executions
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed') AND OLD.status <> NEW.status)
  EXECUTE FUNCTION auto_create_evidence_from_execution();

CREATE TRIGGER trg_auto_create_evidence_on_insert
  AFTER INSERT ON public.job_executions
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed'))
  EXECUTE FUNCTION auto_create_evidence_from_execution();

-- 3h. Enable RLS
ALTER TABLE public.job_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can insert job executions"
  ON public.job_executions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Only service role can finalize executions"
  ON public.job_executions FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "job_executions_select_active_tenant"
  ON public.job_executions FOR SELECT TO authenticated
  USING (((get_active_tenant_id() IS NOT NULL) AND (tenant_id = get_active_tenant_id())) OR is_current_super_admin());

CREATE POLICY "Super admins can view all executions"
  ON public.job_executions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 3i. Grant permissions
GRANT SELECT ON public.job_executions TO authenticated;
GRANT ALL ON public.job_executions TO service_role;

-- ============================================================
-- PART 4: Auto-partition maintenance (creates future partitions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.maintain_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM create_monthly_partitions('audit_logs', 'created_at', 3);
  PERFORM create_monthly_partitions('job_executions', 'created_at', 3);
END;
$$;

-- Schedule monthly partition creation via pg_cron (if available)
-- SELECT cron.schedule('maintain-partitions', '0 0 1 * *', 'SELECT public.maintain_partitions()');

-- ============================================================
-- PART 5: Cleanup old tables (commented out - run manually after validation)
-- ============================================================
-- DROP TABLE IF EXISTS public.audit_logs_old;
-- DROP TABLE IF EXISTS public.job_executions_old;