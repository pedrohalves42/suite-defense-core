
ALTER TABLE system_alerts DROP CONSTRAINT system_alerts_alert_type_check;
ALTER TABLE system_alerts ADD CONSTRAINT system_alerts_alert_type_check CHECK (alert_type = ANY (ARRAY[
  'agent_offline', 'high_cpu', 'high_memory', 'high_disk', 'job_failed',
  'security_threat', 'memory_warning', 'ai_insight_alert', 'blocked_access_pattern',
  'job_integrity_violation', 'safe_mode_auto', 'agent_divergent',
  'progressive_degradation', 'pending_agents', 'non_execution_detected',
  'stuck_installations', 'agent_integrity_failure',
  'suspicious_process', 'low_disk_space', 'anomaly_detection', 'automation_alert'
]));
