-- Step 2: Now make tenant_id NOT NULL in all tables
ALTER TABLE public.agents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.jobs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.reports ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.virus_scans ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.enrollment_keys ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.invites ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.tenant_settings ALTER COLUMN tenant_id SET NOT NULL;

-- Add foreign key constraints to ensure referential integrity
ALTER TABLE public.agents 
  ADD CONSTRAINT fk_agents_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.jobs 
  ADD CONSTRAINT fk_jobs_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.reports 
  ADD CONSTRAINT fk_reports_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.virus_scans 
  ADD CONSTRAINT fk_virus_scans_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.enrollment_keys 
  ADD CONSTRAINT fk_enrollment_keys_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.invites 
  ADD CONSTRAINT fk_invites_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.audit_logs 
  ADD CONSTRAINT fk_audit_logs_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.user_roles 
  ADD CONSTRAINT fk_user_roles_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

ALTER TABLE public.tenant_settings 
  ADD CONSTRAINT fk_tenant_settings_tenant 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE CASCADE;

-- Create a trigger function to auto-populate tenant_id on insert if not provided
CREATE OR REPLACE FUNCTION public.set_tenant_id_from_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := current_user_tenant_id();
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'Cannot determine tenant_id for user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger to all tenant-scoped tables (except user_roles which has special handling)
CREATE TRIGGER set_agents_tenant_id
  BEFORE INSERT ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_from_user();

CREATE TRIGGER set_jobs_tenant_id
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_from_user();

CREATE TRIGGER set_reports_tenant_id
  BEFORE INSERT ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_from_user();

CREATE TRIGGER set_virus_scans_tenant_id
  BEFORE INSERT ON public.virus_scans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_from_user();

CREATE TRIGGER set_enrollment_keys_tenant_id
  BEFORE INSERT ON public.enrollment_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_from_user();

CREATE TRIGGER set_invites_tenant_id
  BEFORE INSERT ON public.invites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_from_user();

CREATE TRIGGER set_audit_logs_tenant_id
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tenant_id_from_user();