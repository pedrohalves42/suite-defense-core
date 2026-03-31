
-- Add service_role write policy on audit_logs parent (defense-in-depth)
-- This propagates to ALL partitions automatically via native partitioning
CREATE POLICY "audit_logs_insert_service_role"
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "audit_logs_all_service_role"
  ON public.audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
