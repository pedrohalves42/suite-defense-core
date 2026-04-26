-- =====================================================
-- FASE 1: Controle de Processos - Novas Acoes de Playbook
-- =====================================================

-- 1. Criar novo playbook para controle de processos suspeitos
INSERT INTO public.playbooks (
  id,
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_conditions,
  severity,
  is_system,
  is_enabled,
  require_approval,
  cooldown_minutes,
  version
) VALUES (
  'a6000000-0000-0000-0000-000000000006',
  NULL,
  'Processo Suspeito Detectado',
  'Responde automaticamente quando um processo suspeito ou malicioso e identificado',
  'suspicious_process',
  '{"process_reputation": "malicious", "min_occurrences": 1}'::jsonb,
  'critical',
  true,
  true,
  true,
  60,
  1
) ON CONFLICT (id) DO NOTHING;

-- 2. Adicionar acoes para o playbook de processo suspeito
INSERT INTO public.playbook_actions (
  id,
  playbook_id,
  order_index,
  action_type,
  label,
  description,
  action_payload,
  risk_level
) VALUES
(
  'b6100000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000006',
  1,
  'notify',
  'Alertar sobre processo suspeito',
  'Envia notificacao sobre o processo detectado para analise',
  '{"channel": "all", "priority": "high"}'::jsonb,
  'low'
),
(
  'b6100000-0000-0000-0000-000000000002',
  'a6000000-0000-0000-0000-000000000006',
  2,
  'kill_process',
  'Encerrar processo',
  'Mata o processo suspeito imediatamente',
  '{"use_force": true}'::jsonb,
  'high'
),
(
  'b6100000-0000-0000-0000-000000000003',
  'a6000000-0000-0000-0000-000000000006',
  3,
  'isolate',
  'Isolar maquina',
  'Coloca a maquina em quarentena de rede',
  '{"notify_user": true}'::jsonb,
  'high'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Criar playbook para servico nao autorizado
INSERT INTO public.playbooks (
  id,
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_conditions,
  severity,
  is_system,
  is_enabled,
  require_approval,
  cooldown_minutes,
  version
) VALUES (
  'a7000000-0000-0000-0000-000000000007',
  NULL,
  'Servico Nao Autorizado',
  'Responde quando um servico nao autorizado e detectado em execucao',
  'unauthorized_service',
  '{"service_state": "running", "authorized": false}'::jsonb,
  'high',
  true,
  true,
  true,
  30,
  1
) ON CONFLICT (id) DO NOTHING;

-- 4. Adicionar acoes para playbook de servico nao autorizado
INSERT INTO public.playbook_actions (
  id,
  playbook_id,
  order_index,
  action_type,
  label,
  description,
  action_payload,
  risk_level
) VALUES
(
  'b7100000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000007',
  1,
  'notify',
  'Alertar sobre servico',
  'Envia alerta sobre o servico nao autorizado',
  '{"channel": "all"}'::jsonb,
  'low'
),
(
  'b7100000-0000-0000-0000-000000000002',
  'a7000000-0000-0000-0000-000000000007',
  2,
  'stop_service',
  'Parar servico',
  'Para o servico imediatamente',
  '{}'::jsonb,
  'high'
),
(
  'b7100000-0000-0000-0000-000000000003',
  'a7000000-0000-0000-0000-000000000007',
  3,
  'disable_service',
  'Desabilitar servico',
  'Desabilita o servico permanentemente para prevenir reinicio',
  '{}'::jsonb,
  'high'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Adicionar acao restart_service ao playbook de Computador Offline
INSERT INTO public.playbook_actions (
  id,
  playbook_id,
  order_index,
  action_type,
  label,
  description,
  action_payload,
  risk_level
) VALUES
(
  'b1100000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000001',
  4,
  'restart_service',
  'Reiniciar servico do agente',
  'Tenta reiniciar o servico CyberShield no computador',
  '{"service_name": "CyberShieldAgent"}'::jsonb,
  'medium'
)
ON CONFLICT (id) DO NOTHING;