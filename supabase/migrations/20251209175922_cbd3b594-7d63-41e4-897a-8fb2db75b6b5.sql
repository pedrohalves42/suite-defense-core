-- P1-SEC: Corrigir politicas RLS permissivas (INSERT com true para public)
-- Alterar para permitir INSERT apenas via service_role

-- 1. network_anomalies - corrigir INSERT policy
DROP POLICY IF EXISTS "System can insert network anomalies" ON public.network_anomalies;
CREATE POLICY "Service role can insert network anomalies"
ON public.network_anomalies
FOR INSERT
TO service_role
WITH CHECK (true);

-- 2. notification_log - corrigir INSERT policy  
DROP POLICY IF EXISTS "System can insert notification logs" ON public.notification_log;
CREATE POLICY "Service role can insert notification logs"
ON public.notification_log
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3. performance_metrics - corrigir INSERT policy
DROP POLICY IF EXISTS "System can insert metrics" ON public.performance_metrics;
CREATE POLICY "Service role can insert metrics"
ON public.performance_metrics
FOR INSERT
TO service_role
WITH CHECK (true);

-- 4. ai_insights - corrigir INSERT policy (tambem identificada com true)
DROP POLICY IF EXISTS "System can insert insights" ON public.ai_insights;
CREATE POLICY "Service role can insert insights"
ON public.ai_insights
FOR INSERT
TO service_role
WITH CHECK (true);

-- 5. ai_actions - corrigir INSERT policy
DROP POLICY IF EXISTS "System can insert actions" ON public.ai_actions;
CREATE POLICY "Service role can insert actions"
ON public.ai_actions
FOR INSERT
TO service_role
WITH CHECK (true);