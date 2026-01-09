-- ADR-033: Failure Fingerprinting & Incident Grouping
-- Schema, functions, triggers, and views for incident management

-- ============================================
-- PART 1: Core Tables
-- ============================================

-- Table: failure_fingerprints (cross-tenant, aggregated)
CREATE TABLE failure_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Unique identification and versioning
  fingerprint_hash text NOT NULL UNIQUE,
  fingerprint_version int NOT NULL DEFAULT 1,
  
  -- Semantic classification
  source_type text NOT NULL CHECK (source_type IN ('job', 'dlq', 'alert')),
  failure_class text NOT NULL,
  
  -- Normalized signature (deterministic)
  normalized_signature jsonb NOT NULL,
  
  -- Aggregated metrics (updated incrementally)
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  total_occurrences bigint NOT NULL DEFAULT 1,
  distinct_tenants bigint NOT NULL DEFAULT 1,
  distinct_agents bigint NOT NULL DEFAULT 1,
  
  -- Inferred severity
  severity_hint text NOT NULL CHECK (severity_hint IN ('critical', 'high', 'medium', 'low')),
  
  -- Operational state
  is_active boolean NOT NULL DEFAULT true,
  is_trending boolean NOT NULL DEFAULT false,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_fp_active_severity ON failure_fingerprints(is_active, severity_hint);
CREATE INDEX idx_fp_occurrences ON failure_fingerprints(total_occurrences DESC);
CREATE INDEX idx_fp_last_seen ON failure_fingerprints(last_seen_at DESC);
CREATE INDEX idx_fp_source_type ON failure_fingerprints(source_type, failure_class);
CREATE INDEX idx_fp_signature ON failure_fingerprints USING gin(normalized_signature);

-- Table: failure_occurrences (per-tenant events)
CREATE TABLE failure_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  fingerprint_id uuid NOT NULL REFERENCES failure_fingerprints(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Event source
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  
  -- Additional context
  agent_id uuid,
  error_excerpt text,
  
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_fo_fingerprint ON failure_occurrences(fingerprint_id);
CREATE INDEX idx_fo_tenant ON failure_occurrences(tenant_id);
CREATE INDEX idx_fo_occurred ON failure_occurrences(occurred_at DESC);
CREATE INDEX idx_fo_source ON failure_occurrences(source_type, source_id);

-- Add fingerprint_id to tasks table
ALTER TABLE tasks ADD COLUMN fingerprint_id uuid REFERENCES failure_fingerprints(id);
CREATE INDEX idx_tasks_fingerprint ON tasks(fingerprint_id);

-- ============================================
-- PART 2: RLS Policies
-- ============================================

ALTER TABLE failure_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_occurrences ENABLE ROW LEVEL SECURITY;

-- Fingerprints: global read (cross-tenant by design)
CREATE POLICY "fingerprints_read_all" ON failure_fingerprints
  FOR SELECT USING (true);

-- Fingerprints: service role only for write
CREATE POLICY "fingerprints_service_write" ON failure_fingerprints
  FOR ALL USING (
    auth.role() = 'service_role' OR is_current_super_admin()
  );

-- Occurrences: filtered by tenant
CREATE POLICY "occurrences_tenant_read" ON failure_occurrences
  FOR SELECT USING (
    tenant_id = get_active_tenant_id() OR is_current_super_admin()
  );

-- Occurrences: service role only for write
CREATE POLICY "occurrences_service_write" ON failure_occurrences
  FOR ALL USING (
    auth.role() = 'service_role' OR is_current_super_admin()
  );

-- ============================================
-- PART 3: Helper Functions
-- ============================================

-- Function: Calculate deterministic fingerprint hash
CREATE OR REPLACE FUNCTION calculate_fingerprint_hash(signature jsonb)
RETURNS text AS $$
BEGIN
  RETURN encode(
    sha256(
      convert_to(
        (SELECT string_agg(key || ':' || COALESCE(value, 'null'), '|' ORDER BY key)
         FROM jsonb_each_text(signature)),
        'UTF8'
      )
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Normalize job failure into signature
CREATE OR REPLACE FUNCTION normalize_job_failure(job_record jobs)
RETURNS jsonb AS $$
DECLARE
  error_code text;
  agent_version_major text;
  signature jsonb;
BEGIN
  -- Extract normalized error code
  error_code := CASE
    WHEN job_record.error_message ~* 'ECONNRESET|timeout|ETIMEDOUT|timed out' THEN 'NETWORK_TIMEOUT'
    WHEN job_record.error_message ~* 'permission denied|403|unauthorized|401' THEN 'AUTH_ERROR'
    WHEN job_record.error_message ~* 'null|undefined|NaN|nil' THEN 'NULL_REFERENCE'
    WHEN job_record.error_message ~* 'out of memory|heap|stack overflow' THEN 'MEMORY_ERROR'
    WHEN job_record.error_message ~* 'disk full|no space|ENOSPC' THEN 'DISK_ERROR'
    WHEN job_record.error_message ~* 'connection refused|ECONNREFUSED' THEN 'CONNECTION_REFUSED'
    WHEN job_record.error_message ~* 'DNS|resolve|ENOTFOUND' THEN 'DNS_ERROR'
    WHEN job_record.error_message ~* 'certificate|SSL|TLS' THEN 'SSL_ERROR'
    WHEN job_record.error_message IS NULL THEN 'NO_MESSAGE'
    ELSE 'UNKNOWN'
  END;
  
  -- Get agent version major
  SELECT COALESCE(
    CASE 
      WHEN a.agent_version ~ '^1\.' THEN 'v1'
      WHEN a.agent_version ~ '^2\.' THEN 'v2'
      WHEN a.agent_version ~ '^3\.' THEN 'v3'
      ELSE 'unknown'
    END,
    'unknown'
  ) INTO agent_version_major
  FROM agents a WHERE a.id = job_record.agent_id;
  
  -- Build signature
  signature := jsonb_build_object(
    'source_type', 'job',
    'job_type', COALESCE(job_record.type, 'unknown'),
    'failure_class', COALESCE(job_record.failure_class, 'UNKNOWN'),
    'error_code', error_code,
    'agent_version_major', COALESCE(agent_version_major, 'unknown')
  );
  
  RETURN signature;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Register failure occurrence
CREATE OR REPLACE FUNCTION register_failure_occurrence(
  p_signature jsonb,
  p_tenant_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_agent_id uuid DEFAULT NULL,
  p_error_excerpt text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_hash text;
  v_fingerprint_id uuid;
  v_severity text;
  v_failure_class text;
BEGIN
  -- Calculate hash
  v_hash := calculate_fingerprint_hash(p_signature);
  v_failure_class := COALESCE(p_signature->>'failure_class', 'UNKNOWN');
  
  -- Determine severity based on failure class
  v_severity := CASE v_failure_class
    WHEN 'BUG' THEN 'critical'
    WHEN 'CASCADE_FAILURE' THEN 'critical'
    WHEN 'AGENT_STALLED' THEN 'high'
    WHEN 'AGENT_INCOMPATIBLE' THEN 'high'
    WHEN 'AGENT_OFFLINE' THEN 'high'
    WHEN 'POLICY' THEN 'medium'
    WHEN 'TIMEOUT' THEN 'medium'
    ELSE 'low'
  END;
  
  -- UPSERT fingerprint
  INSERT INTO failure_fingerprints (
    fingerprint_hash,
    source_type,
    failure_class,
    normalized_signature,
    severity_hint
  ) VALUES (
    v_hash,
    p_source_type,
    v_failure_class,
    p_signature,
    v_severity
  )
  ON CONFLICT (fingerprint_hash) DO UPDATE SET
    last_seen_at = now(),
    total_occurrences = failure_fingerprints.total_occurrences + 1,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_fingerprint_id;
  
  -- Register occurrence
  INSERT INTO failure_occurrences (
    fingerprint_id,
    tenant_id,
    source_type,
    source_id,
    agent_id,
    error_excerpt
  ) VALUES (
    v_fingerprint_id,
    p_tenant_id,
    p_source_type,
    p_source_id,
    p_agent_id,
    p_error_excerpt
  );
  
  -- Update distinct counters (simplified - use subquery)
  UPDATE failure_fingerprints SET
    distinct_tenants = (
      SELECT COUNT(DISTINCT tenant_id) 
      FROM failure_occurrences 
      WHERE fingerprint_id = v_fingerprint_id
    ),
    distinct_agents = (
      SELECT COUNT(DISTINCT agent_id) 
      FROM failure_occurrences 
      WHERE fingerprint_id = v_fingerprint_id
        AND agent_id IS NOT NULL
    )
  WHERE id = v_fingerprint_id;
  
  RETURN v_fingerprint_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 4: Trigger for Job Failures
-- ============================================

CREATE OR REPLACE FUNCTION trigger_fingerprint_job_failure()
RETURNS trigger AS $$
DECLARE
  v_signature jsonb;
BEGIN
  -- Only for failures (status changed to failed)
  IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'failed') THEN
    v_signature := normalize_job_failure(NEW);
    
    PERFORM register_failure_occurrence(
      v_signature,
      NEW.tenant_id,
      'job',
      NEW.id,
      NEW.agent_id,
      LEFT(NEW.error_message, 500)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_fingerprint_job_failure
  AFTER UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_fingerprint_job_failure();

-- ============================================
-- PART 5: View for Dashboard
-- ============================================

CREATE OR REPLACE VIEW v_incident_groups AS
SELECT
  fp.id,
  fp.fingerprint_hash,
  fp.source_type,
  fp.failure_class,
  fp.normalized_signature,
  fp.severity_hint,
  fp.total_occurrences,
  fp.distinct_tenants,
  fp.distinct_agents,
  fp.first_seen_at,
  fp.last_seen_at,
  fp.is_active,
  fp.is_trending,
  -- Calculate if "ongoing" (activity in last 4 hours)
  (fp.last_seen_at > now() - interval '4 hours') as is_ongoing,
  -- Calculate 24h occurrences for trend
  COALESCE(
    (SELECT COUNT(*) FROM failure_occurrences fo 
     WHERE fo.fingerprint_id = fp.id 
       AND fo.occurred_at > now() - interval '24 hours'),
    0
  )::bigint as occurrences_24h
FROM failure_fingerprints fp
WHERE fp.is_active = true
ORDER BY 
  CASE fp.severity_hint 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3 
    ELSE 4 
  END,
  fp.last_seen_at DESC;

-- ============================================
-- PART 6: Comments
-- ============================================

COMMENT ON TABLE failure_fingerprints IS 'ADR-033: Aggregated failure patterns for incident grouping';
COMMENT ON TABLE failure_occurrences IS 'ADR-033: Individual failure events linked to fingerprints';
COMMENT ON FUNCTION normalize_job_failure IS 'ADR-033: Extracts deterministic signature from job failure';
COMMENT ON FUNCTION register_failure_occurrence IS 'ADR-033: UPSERT fingerprint and record occurrence';
COMMENT ON VIEW v_incident_groups IS 'ADR-033: Dashboard view for active incident groups';