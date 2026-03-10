
CREATE OR REPLACE FUNCTION public.get_threat_intel_stats(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  v_total_indicators BIGINT;
  v_by_type JSONB;
  v_by_severity JSONB;
  v_by_source JSONB;
  v_open_matches BIGINT;
  v_matches_24h BIGINT;
  v_last_sync JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total_indicators
  FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true;

  SELECT COALESCE(jsonb_object_agg(ti.indicator_type::text, ti.cnt), '{}') INTO v_by_type
  FROM (SELECT indicator_type, COUNT(*) as cnt FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true GROUP BY indicator_type) ti;

  SELECT COALESCE(jsonb_object_agg(ts.severity::text, ts.cnt), '{}') INTO v_by_severity
  FROM (SELECT severity, COUNT(*) as cnt FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true GROUP BY severity) ts;

  SELECT COALESCE(jsonb_object_agg(src.feed_source::text, src.cnt), '{}') INTO v_by_source
  FROM (SELECT source AS feed_source, COUNT(*) as cnt FROM threat_indicators WHERE tenant_id = p_tenant_id AND is_active = true GROUP BY source) src;

  SELECT COUNT(*) INTO v_open_matches
  FROM threat_matches WHERE tenant_id = p_tenant_id AND status = 'open';

  SELECT COUNT(*) INTO v_matches_24h
  FROM threat_matches WHERE tenant_id = p_tenant_id AND created_at > now() - interval '24 hours';

  SELECT jsonb_build_object(
    'source', sl.feed_source::text,
    'completed_at', sl.sync_completed_at,
    'status', sl.status,
    'new_indicators', sl.indicators_new
  ) INTO v_last_sync
  FROM threat_feed_sync_log sl
  WHERE sl.tenant_id = p_tenant_id
  ORDER BY sl.created_at DESC LIMIT 1;

  result := jsonb_build_object(
    'total_indicators', v_total_indicators,
    'by_type', v_by_type,
    'by_severity', v_by_severity,
    'by_source', v_by_source,
    'open_matches', v_open_matches,
    'total_matches_24h', v_matches_24h,
    'last_sync', v_last_sync
  );

  RETURN COALESCE(result, '{}');
END;
$$;
