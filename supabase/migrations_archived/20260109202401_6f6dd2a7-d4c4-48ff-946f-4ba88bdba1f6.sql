-- ADR-033 Security Fixes
-- Fix function search paths and view security

-- Fix calculate_fingerprint_hash search path
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
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Fix normalize_job_failure search path
CREATE OR REPLACE FUNCTION normalize_job_failure(job_record jobs)
RETURNS jsonb AS $$
DECLARE
  error_code text;
  agent_version_major text;
  signature jsonb;
BEGIN
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
  
  SELECT COALESCE(
    CASE 
      WHEN a.agent_version ~ '^1\.' THEN 'v1'
      WHEN a.agent_version ~ '^2\.' THEN 'v2'
      WHEN a.agent_version ~ '^3\.' THEN 'v3'
      ELSE 'unknown'
    END,
    'unknown'
  ) INTO agent_version_major
  FROM public.agents a WHERE a.id = job_record.agent_id;
  
  signature := jsonb_build_object(
    'source_type', 'job',
    'job_type', COALESCE(job_record.type, 'unknown'),
    'failure_class', COALESCE(job_record.failure_class, 'UNKNOWN'),
    'error_code', error_code,
    'agent_version_major', COALESCE(agent_version_major, 'unknown')
  );
  
  RETURN signature;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Fix register_failure_occurrence search path
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
  v_hash := public.calculate_fingerprint_hash(p_signature);
  v_failure_class := COALESCE(p_signature->>'failure_class', 'UNKNOWN');
  
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
  
  INSERT INTO public.failure_fingerprints (
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
    total_occurrences = public.failure_fingerprints.total_occurrences + 1,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_fingerprint_id;
  
  INSERT INTO public.failure_occurrences (
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
  
  UPDATE public.failure_fingerprints SET
    distinct_tenants = (
      SELECT COUNT(DISTINCT tenant_id) 
      FROM public.failure_occurrences 
      WHERE fingerprint_id = v_fingerprint_id
    ),
    distinct_agents = (
      SELECT COUNT(DISTINCT agent_id) 
      FROM public.failure_occurrences 
      WHERE fingerprint_id = v_fingerprint_id
        AND agent_id IS NOT NULL
    )
  WHERE id = v_fingerprint_id;
  
  RETURN v_fingerprint_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix trigger function search path
CREATE OR REPLACE FUNCTION trigger_fingerprint_job_failure()
RETURNS trigger AS $$
DECLARE
  v_signature jsonb;
BEGIN
  IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'failed') THEN
    v_signature := public.normalize_job_failure(NEW);
    
    PERFORM public.register_failure_occurrence(
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix view to use SECURITY INVOKER (drop and recreate)
DROP VIEW IF EXISTS v_incident_groups;

CREATE VIEW v_incident_groups WITH (security_invoker = true) AS
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
  (fp.last_seen_at > now() - interval '4 hours') as is_ongoing,
  COALESCE(
    (SELECT COUNT(*) FROM public.failure_occurrences fo 
     WHERE fo.fingerprint_id = fp.id 
       AND fo.occurred_at > now() - interval '24 hours'),
    0
  )::bigint as occurrences_24h
FROM public.failure_fingerprints fp
WHERE fp.is_active = true
ORDER BY 
  CASE fp.severity_hint 
    WHEN 'critical' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'medium' THEN 3 
    ELSE 4 
  END,
  fp.last_seen_at DESC;

-- Drop overly permissive policies and create proper ones
DROP POLICY IF EXISTS "fingerprints_service_write" ON failure_fingerprints;
DROP POLICY IF EXISTS "occurrences_service_write" ON failure_occurrences;

-- Fingerprints: only super admins can write (service role handled by SECURITY DEFINER functions)
CREATE POLICY "fingerprints_admin_write" ON failure_fingerprints
  FOR INSERT WITH CHECK (is_current_super_admin());

CREATE POLICY "fingerprints_admin_update" ON failure_fingerprints
  FOR UPDATE USING (is_current_super_admin());

CREATE POLICY "fingerprints_admin_delete" ON failure_fingerprints
  FOR DELETE USING (is_current_super_admin());

-- Occurrences: only super admins can write (service role handled by SECURITY DEFINER functions)
CREATE POLICY "occurrences_admin_write" ON failure_occurrences
  FOR INSERT WITH CHECK (is_current_super_admin());

CREATE POLICY "occurrences_admin_update" ON failure_occurrences
  FOR UPDATE USING (is_current_super_admin());

CREATE POLICY "occurrences_admin_delete" ON failure_occurrences
  FOR DELETE USING (is_current_super_admin());