-- HF-RLS-06B: Corrigir classe de vulnerabilidade das guardas compartilhadas
-- Substituir blacklist `current_setting('role') != 'authenticated'` (que deixa anon/qualquer role passar)
-- por whitelist explícita baseada em auth.role() (JWT-derived).
--
-- Semântica nova de auth.role():
--   'service_role' -> edge functions/crons: bypass total
--   NULL           -> chamada interna sem contexto JWT (postgres/migrations/triggers internos): bypass
--   'authenticated'-> valida membership no user_roles
--   'anon' ou qq outro -> negado
--
-- Por que não quebra:
--   * migrations: rodam como postgres sem request.jwt.* -> auth.role() = NULL -> bypass
--   * service_role: JWT com role=service_role -> bypass
--   * postgres direto (psql/cron pg): sem JWT -> NULL -> bypass
--   * jobs internos chamados via edge function: service_role -> bypass
--   * SECURITY DEFINER encadeada: preserva auth.role() do chamador original (correto: se anon iniciou, todas negam)

CREATE OR REPLACE FUNCTION public._assert_caller_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_role text := auth.role();
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: p_tenant_id cannot be null (INV-001)';
  END IF;

  -- Whitelist explícita de bypass: service_role (edge/cron) ou contexto interno sem JWT (postgres/migrations)
  IF v_role = 'service_role' OR v_role IS NULL THEN
    RETURN;
  END IF;

  -- Apenas 'authenticated' pode prosseguir para checagem de membership. Qualquer outro (anon, futuros) é negado.
  IF v_role <> 'authenticated' THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN: role % is not permitted (INV-001)', v_role;
  END IF;

  IF NOT is_current_super_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND tenant_id = p_tenant_id
     ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: Caller does not have access to tenant % (INV-001)', p_tenant_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public._assert_service_role_or_super_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_role text := auth.role();
BEGIN
  -- Whitelist: service_role ou contexto interno sem JWT
  IF v_role = 'service_role' OR v_role IS NULL THEN
    RETURN;
  END IF;

  -- authenticated só passa se for super_admin
  IF v_role = 'authenticated' AND is_current_super_admin() THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'This function can only be called by service_role or super_admin (SSA-SEC-008)';
END;
$function$;

COMMENT ON FUNCTION public._assert_caller_tenant(uuid) IS
  'HF-RLS-06B: whitelist-based auth guard. Uses auth.role() (JWT). anon/other JWT roles are denied. NULL role = internal SQL context = allowed.';
COMMENT ON FUNCTION public._assert_service_role_or_super_admin() IS
  'HF-RLS-06B: whitelist-based auth guard. Uses auth.role() (JWT). anon/other JWT roles are denied. NULL role = internal SQL context = allowed.';
