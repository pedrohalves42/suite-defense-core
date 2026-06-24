-- =============================================================================
-- Bloco B Lint — Anti-Regressão (read-only)
-- =============================================================================
-- Falha (RAISE EXCEPTION) se qualquer um dos 4 invariantes for violado:
--   B-LINT-1: SECURITY DEFINER em public sem search_path
--   B-LINT-2: Policy de escrita (INSERT/UPDATE/DELETE/ALL) com USING(true) ou WITH CHECK(true)
--            em roles que não são service_role
--   B-LINT-3: SECURITY DEFINER em public fora de security_definer_allowlist
--            (warning — só falha se allowlist existir)
--   B-LINT-4: EXECUTE em função SECURITY DEFINER concedido a anon (sem allow explícito)
--
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/bloco-b-lint.sql
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  fail_count integer := 0;
  msg text := '';
  
BEGIN
  -- ==========================================================================
  -- B-LINT-1: SECURITY DEFINER sem search_path
  -- ==========================================================================
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND (p.proconfig IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) cfg
             WHERE cfg ILIKE 'search_path=%'
           ))
  LOOP
    fail_count := fail_count + 1;
    msg := msg || format(E'\n  [B-LINT-1] %s.%s(%s) — SECURITY DEFINER sem search_path',
                         r.nspname, r.proname, r.args);
  END LOOP;

  -- ==========================================================================
  -- B-LINT-2: Policy de escrita USING(true) / WITH CHECK(true) fora de service_role
  -- ==========================================================================
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, roles::text AS roles_text,
           qual::text AS using_clause, with_check::text AS check_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (
        qual::text = 'true'
        OR with_check::text = 'true'
      )
      -- service_role bypassa RLS por design — policies declarativas ok
      AND roles::text NOT IN ('{service_role}')

  LOOP
    fail_count := fail_count + 1;
    msg := msg || format(E'\n  [B-LINT-2] %s.%s — policy "%s" (%s) roles=%s USING=%s WITH CHECK=%s',
                         r.schemaname, r.tablename, r.policyname, r.cmd,
                         r.roles_text, COALESCE(r.using_clause,'<null>'), COALESCE(r.check_clause,'<null>'));
  END LOOP;

  -- ==========================================================================
  -- B-LINT-3: SECURITY DEFINER allowlist
  -- Nota: public.security_definer_allowlist hoje cobre VIEWS, não FUNCTIONS.
  -- Quando uma allowlist por função existir, plugar aqui. Por ora, no-op.
  -- ==========================================================================


  -- ==========================================================================
  -- B-LINT-4: EXECUTE para anon em SECURITY DEFINER (indevido)
  -- ==========================================================================
  -- Baseline conhecida (débito a tratar em PR separada — não regredir além disto):
  --   enforce_critical_job_evidence, get_agents_snapshots_list,
  --   get_agents_list (2 overloads), check_tenant_suspension
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN (
        'enforce_critical_job_evidence',
        'get_agents_snapshots_list',
        'get_agents_list',
        'check_tenant_suspension'
      )
  LOOP
    fail_count := fail_count + 1;
    msg := msg || format(E'\n  [B-LINT-4] %s.%s(%s) — EXECUTE concedido a anon em SECURITY DEFINER',
                         r.nspname, r.proname, r.args);
  END LOOP;


  -- ==========================================================================
  -- RESULTADO
  -- ==========================================================================
  IF fail_count > 0 THEN
    RAISE EXCEPTION E'\n=== BLOCO B LINT FAILED ===\n% violação(ões):%s\n', fail_count, msg;
  ELSE
    RAISE NOTICE E'\n=== BLOCO B LINT PASSED ===\nB-LINT-1 ok, B-LINT-2 ok, B-LINT-4 ok\n';
  END IF;
END;
$$;
