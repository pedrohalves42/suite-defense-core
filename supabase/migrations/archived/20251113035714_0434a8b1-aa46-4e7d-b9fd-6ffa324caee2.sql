-- Add tenant_id column to failed_login_attempts for multi-tenancy support
ALTER TABLE public.failed_login_attempts
ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_failed_login_attempts_tenant_id ON public.failed_login_attempts(tenant_id);

-- Update RLS policies to allow admins to view their tenant's failed login attempts
DROP POLICY IF EXISTS "Super admins can view failed login attempts" ON public.failed_login_attempts;

CREATE POLICY "Admins can view tenant failed login attempts"
ON public.failed_login_attempts
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND tenant_id = current_user_tenant_id()
);

CREATE POLICY "Super admins can view all failed login attempts"
ON public.failed_login_attempts
FOR SELECT
USING (is_super_admin(auth.uid()));