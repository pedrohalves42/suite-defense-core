
CREATE OR REPLACE FUNCTION honeypot_alert_dedup_key(p_alert_type text, p_tenant_id uuid, p_created_at timestamptz)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT p_alert_type || ':' || p_tenant_id::text || ':' || date_trunc('hour', p_created_at)::text || ':' || (extract(minute from p_created_at)::int / 10)::text;
$$;
