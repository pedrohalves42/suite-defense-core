
-- Fase 1: Índices de Performance para Detecção MITRE

CREATE INDEX IF NOT EXISTS idx_detection_rules_tenant_enabled_severity
  ON public.detection_rules (tenant_id, severity DESC)
  WHERE (is_enabled = true);

CREATE INDEX IF NOT EXISTS idx_detection_rules_mitre_technique
  ON public.detection_rules (mitre_technique_id)
  WHERE (is_enabled = true AND mitre_technique_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_detection_rules_mitre_tactic
  ON public.detection_rules (mitre_tactic)
  WHERE (is_enabled = true AND mitre_tactic IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_type_created
  ON public.security_events (tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_severity_status
  ON public.system_alerts (tenant_id, severity, status);

CREATE INDEX IF NOT EXISTS idx_evidence_logs_tenant_type_created
  ON public.agent_evidence_logs (tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mitre_techniques_tactic
  ON public.mitre_attack_techniques (tactic);
