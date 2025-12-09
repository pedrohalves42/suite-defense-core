-- Add INSERT policies to all agent_system_metrics partition tables
-- These policies block direct INSERT from authenticated users (defense-in-depth)
-- Edge Functions using service_role bypass RLS and continue to work

-- 2025_12
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2025_12
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_01
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_01
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_02
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_02
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_03
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_03
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_04
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_04
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_05
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_05
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_06
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_06
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_07
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_07
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_08
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_08
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_09
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_09
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_10
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_10
FOR INSERT 
TO authenticated
WITH CHECK (false);

-- 2026_11
CREATE POLICY "Block direct INSERT from authenticated users" 
ON public.agent_system_metrics_2026_11
FOR INSERT 
TO authenticated
WITH CHECK (false);