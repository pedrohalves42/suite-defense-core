
-- HF-LATENT-RPC-MISSING-01a
-- Single official facade for blast radius checks.
-- Contract (jsonb, all fields always present):
--   { allowed: boolean, reason: text|null, current_radius: numeric, max_radius: numeric }

CREATE OR REPLACE FUNCTION public.check_blast_radius(
  p_tenant_id uuid,
  p_action_type text,
  p_affected_count integer DEFAULT 1,
  p_severity text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_total       integer;
  v_affected    integer;
  v_current     numeric;
  v_max         numeric;
  v_allowed     boolean;
  v_reason      text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'MISSING_TENANT',
      'current_radius', 0,
      'max_radius', 0
    );
  END IF;

  IF p_action_type IS NULL OR length(p_action_type) = 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'MISSING_ACTION_TYPE',
      'current_radius', 0,
      'max_radius', 0
    );
  END IF;

  v_affected := GREATEST(COALESCE(p_affected_count, 0), 0);

  SELECT COUNT(*)::integer INTO v_total
    FROM public.agents
   WHERE tenant_id = p_tenant_id
     AND status = 'active';

  v_current := CASE
    WHEN v_total > 0 THEN ROUND((v_affected::numeric / v_total) * 100, 2)
    ELSE 0
  END;

  v_max := COALESCE(
    public.get_adaptive_blast_radius(p_tenant_id, p_action_type, COALESCE(p_severity, 'medium')),
    0
  );

  IF v_affected = 0 THEN
    v_allowed := true;
    v_reason  := NULL;
  ELSIF v_total = 0 THEN
    -- No active agents to compare against; fail-closed.
    v_allowed := false;
    v_reason  := 'NO_ACTIVE_AGENTS';
  ELSIF v_current > v_max THEN
    v_allowed := false;
    v_reason  := 'EXCEEDS_MAX_RADIUS';
  ELSE
    v_allowed := true;
    v_reason  := NULL;
  END IF;

  BEGIN
    INSERT INTO public.risk_decision_log (tenant_id, event_type, decision, decision_reason, context)
    VALUES (
      p_tenant_id,
      'blast_radius',
      CASE WHEN v_allowed THEN 'allowed' ELSE 'blocked' END,
      COALESCE(v_reason, 'within_limits'),
      jsonb_build_object(
        'action_type', p_action_type,
        'severity', COALESCE(p_severity, 'medium'),
        'affected', v_affected,
        'total', v_total,
        'current_radius', v_current,
        'max_radius', v_max
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Audit logging must never break the decision path.
    NULL;
  END;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'current_radius', v_current,
    'max_radius', v_max
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_blast_radius(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_blast_radius(uuid, text, integer, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_blast_radius(uuid, text, integer, text) IS
  'HF-LATENT-RPC-MISSING-01a: official blast radius facade. Returns {allowed, reason, current_radius, max_radius}. Single source of truth for Edge Functions and UI; do not add overloads.';
