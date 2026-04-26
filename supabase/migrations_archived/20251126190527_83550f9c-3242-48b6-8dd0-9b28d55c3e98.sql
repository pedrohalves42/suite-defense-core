-- Final cleanup: Remove obsolete sales_contacts policy
DROP POLICY IF EXISTS "Admins can view contacts" ON public.sales_contacts;