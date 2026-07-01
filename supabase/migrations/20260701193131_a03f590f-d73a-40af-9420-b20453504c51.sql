-- =============================================================================
-- HF-RLS-06B-EXTRA-C
-- Fecha NEW-P0-C: overload ambíguo get_agents_list(uuid,bool) vs
-- (uuid,bool,uuid) fazia PostgREST responder 300/PGRST203 antes de a
-- autorização ser aplicada. Causa raiz: migração 20260515115359 criou a
-- 3-arg com CREATE OR REPLACE (que não substitui overloads) enquanto a
-- 2-arg pré-existente permanecia no catálogo.
--
-- Estratégia (assinatura única): manter apenas a 2-arg canônica, remover
-- o overload 3-arg (nenhum caller TS/Edge usa p_agent_id) e trancar a
-- invariante com guard SQL — mesmo padrão de HF-RPC-OVERLOAD-AUDIT-01.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_agents_list(uuid, boolean, uuid);

-- Reafirma grants explicitos da variante que sobrevive (evita drift de PUBLIC)
GRANT EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) TO authenticated, service_role;

DO $$
DECLARE
  v_two_arg   int;
  v_three_arg int;
BEGIN
  SELECT COUNT(*) INTO v_two_arg
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_agents_list'
     AND pg_get_function_identity_arguments(p.oid)='p_tenant_id uuid, p_include_archived boolean';

  SELECT COUNT(*) INTO v_three_arg
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_agents_list'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%p_agent_id%';

  IF v_two_arg <> 1 THEN
    RAISE EXCEPTION 'HF-RLS-06B-EXTRA-C: expected exactly 1 canonical 2-arg get_agents_list, found %', v_two_arg;
  END IF;
  IF v_three_arg <> 0 THEN
    RAISE EXCEPTION 'HF-RLS-06B-EXTRA-C: 3-arg overload of get_agents_list should be dropped, found %', v_three_arg;
  END IF;
END $$;

COMMENT ON FUNCTION public.get_agents_list(uuid, boolean) IS
  'HF-RLS-06B-EXTRA-C: única variante canônica. Overload 3-arg removido para eliminar PGRST203 e superfície duplicada de autorização.';