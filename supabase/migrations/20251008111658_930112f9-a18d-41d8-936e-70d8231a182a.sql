-- Remove insecure public policies
DROP POLICY IF EXISTS "Allow public access to agents" ON public.agents;
DROP POLICY IF EXISTS "Allow public access to jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow public access to reports" ON public.reports;

-- Create secure RLS policies for agents table
-- Only service role (edge functions) can read/write
CREATE POLICY "Service role can manage agents"
ON public.agents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Block direct public access (anon role)
CREATE POLICY "Block public access to agents"
ON public.agents
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Create secure RLS policies for jobs table
-- Only service role (edge functions) can read/write
CREATE POLICY "Service role can manage jobs"
ON public.jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Block direct public access (anon role)
CREATE POLICY "Block public access to jobs"
ON public.jobs
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Create secure RLS policies for reports table
-- Only service role (edge functions) can read/write
CREATE POLICY "Service role can manage reports"
ON public.reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Block direct public access (anon role)
CREATE POLICY "Block public access to reports"
ON public.reports
FOR ALL
TO anon
USING (false)
WITH CHECK (false);