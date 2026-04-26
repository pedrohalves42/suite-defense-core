
-- ============================================================================
-- CORRECAO CRITICA: Politicas da Central de Acoes
-- Resolve 1.191 acoes pending (596 security_threat + 430 prediction + outros)
-- ============================================================================

-- Criar politicas para insight_types que estao causando backlog
-- Usando os default mappings do resolve-action-policy como referencia

INSERT INTO tenant_action_policies (tenant_id, insight_type, execution_mode, created_by)
SELECT 
  t.id as tenant_id,
  policy_config.insight_type,
  policy_config.execution_mode,
  NULL as created_by
FROM tenants t
CROSS JOIN (
  VALUES
    -- Tipos com alto volume de pending (auto para destravar)
    ('security_threat', 'auto'),
    ('prediction', 'auto'),
    
    -- Tipos com volume medio (approval por seguranca)
    ('anomaly_detection', 'approval'),
    ('root_cause', 'approval'),
    ('integrity_violation', 'approval'),
    
    -- Tipos adicionais do DEFAULT_MAPPINGS do resolve-action-policy
    ('antivirus_outdated', 'auto'),
    ('agent_offline_suspicious', 'auto'),
    ('agent_tampering', 'auto'),
    ('anomaly_stuck_jobs', 'auto'),
    ('job_failed_recurring', 'auto'),
    ('blocked_access_detected', 'auto'),
    ('vulnerability_high', 'approval'),
    ('safe_mode_prolonged', 'approval'),
    ('data_exfiltration_suspected', 'approval'),
    ('unauthorized_software', 'approval')
) AS policy_config(insight_type, execution_mode)
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_action_policies tap 
  WHERE tap.tenant_id = t.id 
    AND tap.insight_type = policy_config.insight_type
);

-- Verificar total de politicas criadas
-- SELECT COUNT(*) as policies_created FROM tenant_action_policies WHERE created_at > NOW() - INTERVAL '1 minute';
