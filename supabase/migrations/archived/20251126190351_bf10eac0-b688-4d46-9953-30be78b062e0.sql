-- ====================================================================
-- CLEANUP: Remove obsolete permissive policies from agent_releases
-- ====================================================================

-- Remove old policies that allow all authenticated users to read
DROP POLICY IF EXISTS "Authenticated users can read active releases" ON public.agent_releases;
DROP POLICY IF EXISTS "Super admins can manage releases" ON public.agent_releases;

-- Verify current policies (should only be the new restrictive ones)
-- Expected: super_admins_can_manage_agent_releases, admins_can_view_agent_releases

-- ====================================================================
-- PHASE 3: Restrict profiles and sales_contacts tables
-- ====================================================================

-- ====================================================================
-- 3A. Restrict profiles table - users see only their own profile
-- ====================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create restrictive policies for profiles
CREATE POLICY "users_can_read_own_profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "admins_can_read_all_profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "users_can_insert_own_profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_can_update_own_profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "admins_can_update_all_profiles"
ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
  )
);

-- ====================================================================
-- 3B. Restrict sales_contacts table with tenant_id
-- ====================================================================

-- Check if tenant_id column exists in sales_contacts
-- If not, add it (safely with IF NOT EXISTS simulation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'sales_contacts' 
      AND column_name = 'tenant_id'
  ) THEN
    -- Add tenant_id column
    ALTER TABLE public.sales_contacts 
    ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
    
    -- Set default tenant for existing records (if any)
    -- This assigns to first tenant or leaves NULL for manual assignment
    UPDATE public.sales_contacts 
    SET tenant_id = (SELECT id FROM public.tenants LIMIT 1)
    WHERE tenant_id IS NULL;
  END IF;
END $$;

-- Drop existing policies on sales_contacts
DROP POLICY IF EXISTS "Anyone can create sales contacts" ON public.sales_contacts;
DROP POLICY IF EXISTS "Public can insert sales contacts" ON public.sales_contacts;
DROP POLICY IF EXISTS "Admins can view sales contacts" ON public.sales_contacts;

-- Create tenant-isolated policies for sales_contacts
CREATE POLICY "admins_can_view_tenant_sales_contacts"
ON public.sales_contacts
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "admins_can_manage_tenant_sales_contacts"
ON public.sales_contacts
FOR ALL
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
  )
);

-- Allow anonymous/public contact form submissions (if needed for landing page)
CREATE POLICY "public_can_create_sales_contacts"
ON public.sales_contacts
FOR INSERT
WITH CHECK (true);

COMMENT ON POLICY "public_can_create_sales_contacts" ON public.sales_contacts IS 
'Allows public contact form submissions from landing page. Consider adding rate limiting in Edge Function.';