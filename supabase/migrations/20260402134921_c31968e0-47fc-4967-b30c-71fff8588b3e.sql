
-- Fix service_role policies to use proper role check instead of USING (true) for write operations
DROP POLICY IF EXISTS "service_role_honeypot_interactions" ON honeypot_interactions;
CREATE POLICY "service_role_honeypot_interactions"
  ON honeypot_interactions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_honeypot_hourly_stats" ON honeypot_hourly_stats;
CREATE POLICY "service_role_honeypot_hourly_stats"
  ON honeypot_hourly_stats FOR ALL TO service_role
  USING (true) WITH CHECK (true);
