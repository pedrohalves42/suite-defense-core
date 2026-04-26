-- Phase 1: Enable Realtime for metrics and alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_system_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_alerts;

-- Phase 4: Fix existing agents with NULL os_type
UPDATE public.agents 
SET os_type = 'windows' 
WHERE os_version LIKE '10.%' AND os_type IS NULL;