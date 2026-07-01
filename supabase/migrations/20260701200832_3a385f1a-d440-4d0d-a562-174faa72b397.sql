-- HF-RLS-01 — Correção mínima do drift de RLS na partição agent_system_metrics_2026_08.
--
-- Pré-estado (Fase 1, inventário):
--   partição             | rls_enabled | policies
--   2026_05              | t           | service_role_all + tenant_isolation_select (padrão baseline)
--   2026_06              | t           | agent_system_metrics_2026_06_tenant_scoped (padrão P0-S1)
--   2026_07              | t           | agent_system_metrics_2026_07_tenant_scoped (padrão P0-S1)
--   2026_08              | f           | (nenhuma)   ← DIVERGÊNCIA
--
-- Correção: aplicar EXATAMENTE o padrão da irmã mais recente (2026_07),
-- reproduzido da migration original 20260622130254_bc846e09 (P0-S1).
-- Sem renomear, sem criar policies extras, sem tocar em outras partições.

ALTER TABLE public.agent_system_metrics_2026_08 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_system_metrics_2026_08_tenant_scoped ON public.agent_system_metrics_2026_08;
CREATE POLICY agent_system_metrics_2026_08_tenant_scoped
ON public.agent_system_metrics_2026_08
AS PERMISSIVE
FOR ALL
TO authenticated
USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())
WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());