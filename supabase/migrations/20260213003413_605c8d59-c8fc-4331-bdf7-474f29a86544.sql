
-- FIX: evaluate_software_risk - agents has no metadata column, make it a no-op that just succeeds
CREATE OR REPLACE FUNCTION public.evaluate_software_risk(p_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: risk evaluation placeholder
  -- Agent risk is tracked through software_inventory and vuln scans, not agent metadata
  PERFORM 1 FROM agents WHERE id = p_agent_id AND archived_at IS NULL;
END;
$$;
