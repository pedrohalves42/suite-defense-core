-- Fix: Add missing alert_types to system_alerts check constraint
-- The firewall_disabled and antivirus_inactive rules need these types
ALTER TABLE public.system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;

ALTER TABLE public.system_alerts ADD CONSTRAINT system_alerts_alert_type_check 
CHECK (alert_type = ANY (ARRAY[
  'agent_offline', 'high_cpu', 'high_memory', 'high_disk', 'job_failed',
  'security_threat', 'memory_warning', 'ai_insight_alert', 'blocked_access_pattern',
  'job_integrity_violation', 'safe_mode_auto', 'agent_divergent', 
  'progressive_degradation', 'pending_agents', 'non_execution_detected',
  'stuck_installations', 'agent_integrity_failure', 'suspicious_process',
  'low_disk_space', 'anomaly_detection', 'automation_alert',
  -- New security check types
  'firewall_disabled', 'antivirus_inactive', 'unauthorized_usb', 'vulnerable_software'
]));

-- Clean up old failed executions that were caused by missing alert types
DELETE FROM automation_executions 
WHERE status = 'failed' 
AND error_message LIKE '%system_alerts_alert_type_check%';