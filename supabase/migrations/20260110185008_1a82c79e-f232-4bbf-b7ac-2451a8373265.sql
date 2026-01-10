-- Enable RLS on the new audit table (admin-only access)
ALTER TABLE public._audit_orphan_profiles ENABLE ROW LEVEL SECURITY;

-- Only super admins can access audit data
CREATE POLICY "Super admins can view audit data"
ON public._audit_orphan_profiles
FOR SELECT
USING (public.is_current_super_admin());