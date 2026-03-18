-- V-2004: Prevent self-promotion to admin role
-- Enhance existing guard to block any authenticated user from 
-- inserting admin role for themselves (only existing admins or super_admins can do it)

CREATE OR REPLACE FUNCTION public.guard_role_self_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block self-promotion: user cannot assign admin role to themselves
  -- unless they are already an admin or super_admin for this tenant
  IF NEW.user_id = auth.uid() AND NEW.role = 'admin' THEN
    -- Check if caller is already admin or super_admin
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = NEW.tenant_id
        AND role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'SECURITY: Cannot self-promote to admin (INV-006)';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop if exists to avoid duplicate
DROP TRIGGER IF EXISTS guard_role_self_promotion_trigger ON public.user_roles;

CREATE TRIGGER guard_role_self_promotion_trigger
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_role_self_promotion()