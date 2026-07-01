-- =============================================================================
-- CI Guard: get_agents_list() must be a single canonical 2-arg overload
-- Ref: HF-RLS-06B-EXTRA-C
--
-- Symptom prevented: PostgREST returns 300/PGRST203 for get_agents_list when a
-- 3-arg overload with p_agent_id (DEFAULT NULL) coexists with the canonical
-- 2-arg. The ambiguity was exploited as NEW-P0-C during the hf-rls-06b
-- validation window (the 3-arg was reachable and bypassed the intended path).
--
-- Invariant enforced:
--   * exactly one overload get_agents_list(uuid, boolean) exists
--   * no other overload of get_agents_list exists in public
--   * no p_agent_id parameter is reintroduced
-- =============================================================================

DO $$
DECLARE
  v_canonical  int;
  v_total      int;
  v_has_agent  int;
BEGIN
  SELECT COUNT(*) INTO v_canonical
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_agents_list'
     AND pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_include_archived boolean';

  SELECT COUNT(*) INTO v_total
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_agents_list';

  SELECT COUNT(*) INTO v_has_agent
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_agents_list'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_agent_id%';

  IF v_canonical <> 1 THEN
    RAISE EXCEPTION
      'GET_AGENTS_LIST GUARD: expected exactly 1 canonical get_agents_list(uuid, boolean), found %',
      v_canonical;
  END IF;

  IF v_total <> 1 THEN
    RAISE EXCEPTION
      'GET_AGENTS_LIST GUARD: expected exactly 1 overload of get_agents_list, found % (overload ambiguity risk PGRST203)',
      v_total;
  END IF;

  IF v_has_agent <> 0 THEN
    RAISE EXCEPTION
      'GET_AGENTS_LIST GUARD: p_agent_id overload was reintroduced (%). Filter by id on the client instead.',
      v_has_agent;
  END IF;

  RAISE NOTICE 'GET_AGENTS_LIST GUARD: passed (single canonical 2-arg overload)';
END $$;

SELECT 'get_agents_list overload ambiguity check passed' AS result;
