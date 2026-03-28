
-- ADR-029: Correcao de Schema Inconsistente e Erros de Producao
-- ================================================================

-- FASE 1: Criar VIEW para anti-replay HMAC (aponta para tabela correta)
-- A tabela hmac_signatures tem schema de configuracao (secrets)
-- A tabela hmac_signatures_partitioned tem schema de anti-replay (id, signature, used_at)
-- Solucao: Criar view com nome que o codigo espera

-- Renomear tabela atual para indicar seu proposito real
ALTER TABLE IF EXISTS hmac_signatures RENAME TO hmac_agent_secrets;

-- Renomear tabela partitioned para ser a principal (usada pelo codigo)
ALTER TABLE IF EXISTS hmac_signatures_partitioned RENAME TO hmac_signatures;

-- Criar indice para performance de replay detection
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_signature ON hmac_signatures(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_used_at ON hmac_signatures(used_at);

-- FASE 4: Adicionar 'pending_agents' ao constraint de alert_type
-- Erro: "new row for relation system_alerts violates check constraint system_alerts_alert_type_check"
ALTER TABLE system_alerts DROP CONSTRAINT IF EXISTS system_alerts_alert_type_check;

ALTER TABLE system_alerts ADD CONSTRAINT system_alerts_alert_type_check 
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
  'progressive_degradation'::text,
  'pending_agents'::text
]));
