-- Fix RLS on rls_test_results table
ALTER TABLE public.rls_test_results ENABLE ROW LEVEL SECURITY;

-- Allow admins and super_admins to view all test results
CREATE POLICY "Admins can view RLS test results"
  ON public.rls_test_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );

-- Allow system to insert test results
CREATE POLICY "System can insert RLS test results"
  ON public.rls_test_results FOR INSERT
  WITH CHECK (true);