-- Adicionar novos tipos de alerta ao check constraint
ALTER TABLE public.system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;

ALTER TABLE public.system_alerts ADD CONSTRAINT system_alerts_alert_type_check 
CHECK (alert_type = ANY (ARRAY[
  'agent_offline'::text, 
  'high_cpu'::text, 
  'high_memory'::text, 
  'high_disk'::text, 
  'job_failed'::text, 
  'security_threat'::text, 
  'memory_warning'::text,
  'ai_insight_alert'::text,
  'blocked_access_pattern'::text,
  'job_integrity_violation'::text,
  'safe_mode_auto'::text,
  'agent_divergent'::text,
  'progressive_degradation'::text
]));