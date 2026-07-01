-- HF-RLS-06C: Reduce attack surface on tenant-scoped agent RPCs.
-- Revoke EXECUTE from PUBLIC (which implicitly grants anon) on two RPCs whose
-- only legitimate consumers are authenticated frontend sessions (super_admin
-- and per-tenant users). Keep explicit grants for authenticated + service_role.
--
-- Inventory (pre-change):
--   public.get_agents_list(uuid, boolean)      -> PUBLIC(X), authenticated(X), service_role(X)
--   public.get_agents_snapshots_list(uuid)     -> PUBLIC(X), authenticated(X), service_role(X)
--
-- Consumers verified:
--   * Frontend (src/**): supabase.rpc(...) as authenticated user only.
--   * Edge Functions (supabase/functions/**): no runtime call, only type refs.
--   * anon: no documented functional requirement.
--   * PUBLIC: no documented consumer.
--
-- Post-change target:
--   PUBLIC        -> revoked
--   anon          -> revoked (no explicit grant; PUBLIC pathway removed)
--   authenticated -> KEPT (frontend)
--   service_role  -> KEPT (admin/scripts safety net)

REVOKE EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) FROM anon;

-- Reaffirm minimum required grants (idempotent).
GRANT EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) TO authenticated, service_role;