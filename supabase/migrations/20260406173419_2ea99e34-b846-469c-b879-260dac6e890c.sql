
CREATE OR REPLACE FUNCTION public.collect_soc2_evidence_all_tenants()
RETURNS TABLE(tenant_id UUID, evidence_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_count INTEGER;
BEGIN
  FOR v_tenant IN SELECT t.id FROM tenants t WHERE t.state = 'active' OR t.state IS NULL ORDER BY t.id
  LOOP
    v_count := collect_soc2_evidence_for_tenant(v_tenant.id);
    tenant_id := v_tenant.id;
    evidence_count := v_count;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
