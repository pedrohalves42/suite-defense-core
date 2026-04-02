
-- 1. Allow hmac_secret to be NULL for native honeypots
ALTER TABLE agents ALTER COLUMN hmac_secret DROP NOT NULL;

-- 2. Add unique constraint for alert deduplication
-- Uses a partial index on honeypot alert types + tenant + 10-minute window
CREATE OR REPLACE FUNCTION honeypot_alert_dedup_key(p_alert_type text, p_tenant_id uuid, p_created_at timestamptz)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_alert_type || ':' || p_tenant_id::text || ':' || date_trunc('hour', p_created_at)::text || ':' || (extract(minute from p_created_at)::int / 10)::text;
$$;

-- 3. Aggregate hourly honeypot stats function (called by cron)
CREATE OR REPLACE FUNCTION aggregate_honeypot_hourly_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour_start timestamptz;
BEGIN
  -- Aggregate the previous hour
  v_hour_start := date_trunc('hour', now() - interval '1 hour');
  
  INSERT INTO honeypot_hourly_stats (
    tenant_id, hour_start, interaction_count, unique_ip_hashes,
    malicious_count, suspicious_count, benign_count, recon_count,
    native_count, flipped_count, top_paths
  )
  SELECT
    tenant_id,
    v_hour_start,
    count(*)::int,
    count(DISTINCT source_ip_hash)::int,
    count(*) FILTER (WHERE classification = 'malicious')::int,
    count(*) FILTER (WHERE classification = 'suspicious')::int,
    count(*) FILTER (WHERE classification = 'benign')::int,
    count(*) FILTER (WHERE classification = 'reconnaissance')::int,
    count(*) FILTER (WHERE mode = 'native')::int,
    count(*) FILTER (WHERE mode = 'flipped')::int,
    (SELECT jsonb_object_agg(p, c) FROM (
      SELECT path AS p, count(*)::int AS c
      FROM honeypot_interactions hi2
      WHERE hi2.tenant_id = honeypot_interactions.tenant_id
        AND hi2.created_at >= v_hour_start
        AND hi2.created_at < v_hour_start + interval '1 hour'
      GROUP BY path ORDER BY count(*) DESC LIMIT 5
    ) sub)
  FROM honeypot_interactions
  WHERE created_at >= v_hour_start
    AND created_at < v_hour_start + interval '1 hour'
  GROUP BY tenant_id
  ON CONFLICT (tenant_id, hour_start) DO UPDATE SET
    interaction_count = EXCLUDED.interaction_count,
    unique_ip_hashes = EXCLUDED.unique_ip_hashes,
    malicious_count = EXCLUDED.malicious_count,
    suspicious_count = EXCLUDED.suspicious_count,
    benign_count = EXCLUDED.benign_count,
    recon_count = EXCLUDED.recon_count,
    native_count = EXCLUDED.native_count,
    flipped_count = EXCLUDED.flipped_count,
    top_paths = EXCLUDED.top_paths;
END;
$$;

-- 4. Add unique constraint on hourly stats for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'honeypot_hourly_stats_tenant_hour_key'
  ) THEN
    ALTER TABLE honeypot_hourly_stats ADD CONSTRAINT honeypot_hourly_stats_tenant_hour_key UNIQUE (tenant_id, hour_start);
  END IF;
END $$;

-- 5. Global feature flag support: allow tenant_id to be NULL
ALTER TABLE feature_flags ALTER COLUMN tenant_id DROP NOT NULL;

-- 6. Replace isFeatureEnabled with global + tenant support
CREATE OR REPLACE FUNCTION is_feature_enabled(p_flag_key text, p_tenant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global_enabled boolean;
  v_tenant_enabled boolean;
BEGIN
  -- Check global flag first (tenant_id IS NULL)
  SELECT enabled INTO v_global_enabled
  FROM feature_flags
  WHERE key = p_flag_key AND tenant_id IS NULL
  LIMIT 1;
  
  -- If global flag exists and is disabled, deny regardless of tenant
  IF v_global_enabled IS NOT NULL AND NOT v_global_enabled THEN
    RETURN false;
  END IF;
  
  -- Check tenant-specific flag
  IF p_tenant_id IS NOT NULL THEN
    SELECT enabled INTO v_tenant_enabled
    FROM feature_flags
    WHERE key = p_flag_key AND tenant_id = p_tenant_id
    LIMIT 1;
    
    IF v_tenant_enabled IS NOT NULL THEN
      RETURN v_tenant_enabled;
    END IF;
  END IF;
  
  -- If global flag exists and is enabled, allow
  IF v_global_enabled IS NOT NULL THEN
    RETURN v_global_enabled;
  END IF;
  
  -- No flag found: fail-open for features, but HONEYPOT is opt-in
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION is_feature_enabled TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION aggregate_honeypot_hourly_stats TO service_role;
