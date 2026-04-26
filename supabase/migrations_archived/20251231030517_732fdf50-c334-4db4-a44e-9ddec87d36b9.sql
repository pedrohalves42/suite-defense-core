-- Insert new AI action configs for Phase 3 action types

INSERT INTO public.ai_action_configs (action_type, description, is_enabled, requires_approval, risk_level, max_executions_per_day)
VALUES 
  ('isolate_agent', 'Isola um agente da rede para contencao de ameacas', false, true, 'high', 5),
  ('revoke_token', 'Revoga todos os tokens ativos de um agente', false, true, 'high', 10),
  ('disable_user', 'Registra solicitacao para desabilitar um usuario', false, true, 'high', 5),
  ('block_ip', 'Bloqueia um endereco IP especifico', false, true, 'high', 10),
  ('include_firewall_rule', 'Adiciona uma regra de firewall no agente', true, true, 'medium', 20),
  ('restart_service', 'Reinicia um servico especifico no agente', true, true, 'medium', 15),
  ('acknowledge_alerts', 'Reconhece alertas em massa', true, false, 'low', 100),
  ('cleanup_stuck_jobs', 'Limpa jobs travados ou pendentes antigos', true, true, 'medium', 10)
ON CONFLICT (action_type) DO UPDATE SET
  description = EXCLUDED.description,
  risk_level = EXCLUDED.risk_level,
  max_executions_per_day = EXCLUDED.max_executions_per_day;