-- ================================================
-- PHASE 1: MULTI-TENANT FOUNDATION
-- ================================================

-- Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenants
CREATE POLICY "Users can view their own tenant"
  ON public.tenants FOR SELECT
  USING (owner_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'operator', 'viewer')
  ));

CREATE POLICY "Admins can manage tenants"
  ON public.tenants FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add tenant_id to user_roles
ALTER TABLE public.user_roles 
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to agents
ALTER TABLE public.agents 
  ADD COLUMN IF NOT EXISTS tenant_id_new uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Drop the old tenant_id column (text) and rename the new one
ALTER TABLE public.agents DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.agents RENAME COLUMN tenant_id_new TO tenant_id;

-- Remove agent_token from agents (now in agent_tokens table)
ALTER TABLE public.agents DROP COLUMN IF EXISTS agent_token CASCADE;

-- Add tenant_id to enrollment_keys
ALTER TABLE public.enrollment_keys 
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to jobs
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to reports
ALTER TABLE public.reports 
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to virus_scans
ALTER TABLE public.virus_scans 
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to audit_logs
ALTER TABLE public.audit_logs 
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id ON public.user_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON public.agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_tenant_id ON public.enrollment_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON public.jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_tenant_id ON public.reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_virus_scans_tenant_id ON public.virus_scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);

-- Helper function to get current user's tenant_id
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Update handle_new_user function to create tenant
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  new_tenant_id uuid;
  tenant_slug text;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- Create tenant for new user
  tenant_slug := lower(replace(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), ' ', '-')) || '-' || substring(NEW.id::text from 1 for 8);
  
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    tenant_slug,
    NEW.id
  )
  RETURNING id INTO new_tenant_id;
  
  -- Count existing users
  SELECT COUNT(*) INTO user_count FROM auth.users;
  
  -- Assign role with tenant_id
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, 'admin', new_tenant_id);
  ELSE
    INSERT INTO public.user_roles (user_id, role, tenant_id)
    VALUES (NEW.id, 'viewer', new_tenant_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update RLS policies to include tenant filtering

-- user_roles policies
DROP POLICY IF EXISTS "Admins podem gerenciar todos os roles" ON public.user_roles;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles in their tenant"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

-- agents policies
DROP POLICY IF EXISTS "Admins podem gerenciar todos os agents" ON public.agents;
DROP POLICY IF EXISTS "Operators e viewers podem ler agents" ON public.agents;
DROP POLICY IF EXISTS "Service role tem acesso total aos agents" ON public.agents;

CREATE POLICY "Admins can manage agents in their tenant"
  ON public.agents FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Operators and viewers can read agents in their tenant"
  ON public.agents FOR SELECT
  USING ((has_role(auth.uid(), 'operator'::app_role) OR has_role(auth.uid(), 'viewer'::app_role)) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to agents"
  ON public.agents FOR ALL
  USING (true)
  WITH CHECK (true);

-- enrollment_keys policies
DROP POLICY IF EXISTS "Admins podem gerenciar enrollment_keys" ON public.enrollment_keys;
DROP POLICY IF EXISTS "Operators podem ver enrollment_keys" ON public.enrollment_keys;
DROP POLICY IF EXISTS "Service role tem acesso total aos enrollment_keys" ON public.enrollment_keys;

CREATE POLICY "Admins can manage enrollment keys in their tenant"
  ON public.enrollment_keys FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Operators can view enrollment keys in their tenant"
  ON public.enrollment_keys FOR SELECT
  USING (has_role(auth.uid(), 'operator'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to enrollment keys"
  ON public.enrollment_keys FOR ALL
  USING (true)
  WITH CHECK (true);

-- jobs policies
DROP POLICY IF EXISTS "Admins podem gerenciar todos os jobs" ON public.jobs;
DROP POLICY IF EXISTS "Operators podem atualizar jobs" ON public.jobs;
DROP POLICY IF EXISTS "Operators podem criar e ler jobs" ON public.jobs;
DROP POLICY IF EXISTS "Operators podem inserir jobs" ON public.jobs;
DROP POLICY IF EXISTS "Service role tem acesso total aos jobs" ON public.jobs;

CREATE POLICY "Admins can manage jobs in their tenant"
  ON public.jobs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Operators can manage jobs in their tenant"
  ON public.jobs FOR ALL
  USING (has_role(auth.uid(), 'operator'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'operator'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Viewers can read jobs in their tenant"
  ON public.jobs FOR SELECT
  USING (has_role(auth.uid(), 'viewer'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to jobs"
  ON public.jobs FOR ALL
  USING (true)
  WITH CHECK (true);

-- reports policies
DROP POLICY IF EXISTS "Admins podem gerenciar todos os reports" ON public.reports;
DROP POLICY IF EXISTS "Operators e viewers podem ler reports" ON public.reports;
DROP POLICY IF EXISTS "Service role tem acesso total aos reports" ON public.reports;

CREATE POLICY "Admins can manage reports in their tenant"
  ON public.reports FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Operators and viewers can read reports in their tenant"
  ON public.reports FOR SELECT
  USING ((has_role(auth.uid(), 'operator'::app_role) OR has_role(auth.uid(), 'viewer'::app_role)) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to reports"
  ON public.reports FOR ALL
  USING (true)
  WITH CHECK (true);

-- virus_scans policies
DROP POLICY IF EXISTS "Admins podem gerenciar virus scans" ON public.virus_scans;
DROP POLICY IF EXISTS "Operators e viewers podem ler virus scans" ON public.virus_scans;
DROP POLICY IF EXISTS "Service role tem acesso total aos virus scans" ON public.virus_scans;

CREATE POLICY "Admins can manage virus scans in their tenant"
  ON public.virus_scans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Operators and viewers can read virus scans in their tenant"
  ON public.virus_scans FOR SELECT
  USING ((has_role(auth.uid(), 'operator'::app_role) OR has_role(auth.uid(), 'viewer'::app_role)) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service role has full access to virus scans"
  ON public.virus_scans FOR ALL
  USING (true)
  WITH CHECK (true);

-- audit_logs policies
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Service can insert audit logs" ON public.audit_logs;

CREATE POLICY "Admins can read audit logs in their tenant"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

CREATE POLICY "Service can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);