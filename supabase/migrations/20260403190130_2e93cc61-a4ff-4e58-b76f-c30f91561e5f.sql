
ALTER TABLE system_alerts DROP CONSTRAINT system_alerts_alert_type_check;
ALTER TABLE system_alerts ADD CONSTRAINT system_alerts_alert_type_check CHECK (
  alert_type = ANY (ARRAY[
    'stuck_agent', 'stale_cron', 'system_maintenance', 'firewall_disabled',
    'antivirus_inactive', 'unauthorized_usb', 'vulnerable_software',
    'ai_insight_alert', 'automation_alert', 'agent_long_offline',
    'vulnerability_critical', 'antivirus_outdated', 'certificate_expiring',
    'usb_device_risky', 'process_suspicious', 'behavioral_anomaly',
    'agent_compromised', 'security_incident', 'compliance_drift',
    'high_risk_action', 'brute_force_detected', 'trial_expiring',
    'credential_rotation_overdue'
  ])
);
