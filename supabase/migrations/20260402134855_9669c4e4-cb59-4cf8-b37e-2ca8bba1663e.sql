
-- 1. Aggregation RPC for dashboard (bounded query, no full-table scan)
CREATE OR REPLACE FUNCTION get_honeypot_stats(p_tenant_id UUID DEFAULT NULL, p_hours INT DEFAULT 24)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_cutoff TIMESTAMPTZ := now() - make_interval(hours := p_hours);
BEGIN
  SELECT jsonb_build_object(
    'total_interactions', COALESCE(count(*), 0),
    'unique_ip_hashes', COALESCE(count(DISTINCT source_ip_hash), 0),
    'classifications', COALESCE(
      jsonb_object_agg(cls, cnt) FILTER (WHERE cls IS NOT NULL),
      '{}'::jsonb
    ),
    'modes', COALESCE(
      jsonb_object_agg(m, mcnt) FILTER (WHERE m IS NOT NULL),
      '{}'::jsonb
    )
  ) INTO v_result
  FROM (
    SELECT classification AS cls, count(*) AS cnt, NULL::text AS m, NULL::bigint AS mcnt
    FROM honeypot_interactions
    WHERE created_at >= v_cutoff
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY classification
    UNION ALL
    SELECT NULL, NULL, mode AS m, count(*) AS mcnt
    FROM honeypot_interactions
    WHERE created_at >= v_cutoff
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    GROUP BY mode
  ) sub;

  RETURN COALESCE(v_result, '{"total_interactions":0,"unique_ip_hashes":0,"classifications":{},"modes":{}}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_honeypot_stats(UUID, INT) TO authenticated;

-- 2. Hourly aggregation table for dashboard (avoids raw scans for 7-day views)
CREATE TABLE IF NOT EXISTS honeypot_hourly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  hour_start TIMESTAMPTZ NOT NULL,
  interaction_count INT NOT NULL DEFAULT 0,
  unique_ip_hashes INT NOT NULL DEFAULT 0,
  malicious_count INT NOT NULL DEFAULT 0,
  suspicious_count INT NOT NULL DEFAULT 0,
  benign_count INT NOT NULL DEFAULT 0,
  recon_count INT NOT NULL DEFAULT 0,
  native_count INT NOT NULL DEFAULT 0,
  flipped_count INT NOT NULL DEFAULT 0,
  top_paths JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hour_start)
);

ALTER TABLE honeypot_hourly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_honeypot_hourly_stats"
  ON honeypot_hourly_stats FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id());

CREATE POLICY "service_role_honeypot_hourly_stats"
  ON honeypot_hourly_stats FOR ALL TO service_role
  USING (true);

CREATE INDEX IF NOT EXISTS idx_honeypot_hourly_stats_tenant
  ON honeypot_hourly_stats(tenant_id, hour_start DESC);

-- 3. Aggregation function for pg_cron (runs hourly)
CREATE OR REPLACE FUNCTION aggregate_honeypot_hourly()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour TIMESTAMPTZ := date_trunc('hour', now() - interval '1 hour');
  v_inserted INT := 0;
BEGIN
  INSERT INTO honeypot_hourly_stats (
    tenant_id, hour_start, interaction_count, unique_ip_hashes,
    malicious_count, suspicious_count, benign_count, recon_count,
    native_count, flipped_count, top_paths
  )
  SELECT
    tenant_id,
    v_hour,
    count(*),
    count(DISTINCT source_ip_hash),
    count(*) FILTER (WHERE classification = 'malicious'),
    count(*) FILTER (WHERE classification = 'suspicious'),
    count(*) FILTER (WHERE classification = 'benign'),
    count(*) FILTER (WHERE classification = 'reconnaissance'),
    count(*) FILTER (WHERE mode = 'native'),
    count(*) FILTER (WHERE mode = 'flipped'),
    (SELECT jsonb_agg(jsonb_build_object('path', p, 'count', c))
     FROM (SELECT path AS p, count(*) AS c
           FROM honeypot_interactions hi2
           WHERE hi2.tenant_id = honeypot_interactions.tenant_id
             AND hi2.created_at >= v_hour AND hi2.created_at < v_hour + interval '1 hour'
           GROUP BY path ORDER BY count(*) DESC LIMIT 5) paths)
  FROM honeypot_interactions
  WHERE created_at >= v_hour AND created_at < v_hour + interval '1 hour'
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

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 4. Cleanup function for pg_cron (purge old data)
CREATE OR REPLACE FUNCTION cleanup_honeypot_old_data(p_retention_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interactions_deleted INT;
  v_buckets_deleted INT;
  v_blocks_deleted INT;
  v_hourly_deleted INT;
  v_cutoff TIMESTAMPTZ := now() - make_interval(days := p_retention_days);
BEGIN
  -- Delete old interactions
  DELETE FROM honeypot_interactions WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_interactions_deleted = ROW_COUNT;

  -- Delete old rate limit buckets (>1 hour old)
  DELETE FROM honeypot_rate_buckets WHERE bucket_start < now() - interval '1 hour';
  GET DIAGNOSTICS v_buckets_deleted = ROW_COUNT;

  -- Delete expired blocks
  DELETE FROM honeypot_blocks WHERE blocked_until < now();
  GET DIAGNOSTICS v_blocks_deleted = ROW_COUNT;

  -- Delete old hourly stats (keep 180 days)
  DELETE FROM honeypot_hourly_stats WHERE hour_start < now() - interval '180 days';
  GET DIAGNOSTICS v_hourly_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'interactions_deleted', v_interactions_deleted,
    'buckets_deleted', v_buckets_deleted,
    'blocks_deleted', v_blocks_deleted,
    'hourly_deleted', v_hourly_deleted
  );
END;
$$;
