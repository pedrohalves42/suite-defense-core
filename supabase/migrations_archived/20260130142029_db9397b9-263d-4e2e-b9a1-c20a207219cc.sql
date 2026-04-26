-- Migration: Corrigir politicas de invites para usar authenticated em vez de public
-- Problema: Politicas atuais usam role 'public' que e menos restritivo
-- Solucao: Migrar para 'authenticated' para melhor pratica de seguranca

-- Drop existing public policies
DROP POLICY IF EXISTS invites_delete_active_tenant ON public.invites;
DROP POLICY IF EXISTS invites_insert_active_tenant ON public.invites;
DROP POLICY IF EXISTS invites_select_active_tenant ON public.invites;
DROP POLICY IF EXISTS invites_update_active_tenant ON public.invites;

-- Create new authenticated-only policies
CREATE POLICY invites_select_authenticated ON public.invites 
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY invites_insert_authenticated ON public.invites 
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY invites_update_authenticated ON public.invites 
  FOR UPDATE TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())
  WITH CHECK (tenant_id = get_active_tenant_id() OR is_current_super_admin());

CREATE POLICY invites_delete_authenticated ON public.invites 
  FOR DELETE TO authenticated
  USING (is_current_super_admin());

-- Add comment for documentation
COMMENT ON TABLE public.invites IS 'User invitations - RLS policies migrated from public to authenticated role on 2026-01-30 for security hardening';