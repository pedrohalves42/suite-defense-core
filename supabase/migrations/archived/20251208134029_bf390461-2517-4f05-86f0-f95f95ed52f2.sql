-- Remove old constraint
ALTER TABLE public.system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;

-- Add new constraint with memory_warning type
ALTER TABLE public.system_alerts ADD CONSTRAINT system_alerts_alert_type_check 
  CHECK (alert_type = ANY (ARRAY['agent_offline'::text, 'high_cpu'::text, 'high_memory'::text, 'high_disk'::text, 'job_failed'::text, 'security_threat'::text, 'memory_warning'::text]));