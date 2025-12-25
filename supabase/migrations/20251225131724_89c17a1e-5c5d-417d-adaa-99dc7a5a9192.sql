-- =====================================================
-- FASE 1: Controle de Processos - Novas Ações de Playbook
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
  'Responde automaticamente quando um processo suspeito ou malicioso é identificado',
  'suspicious_process',
  '{"process_reputation": "malicious", "min_occurrences": 1}'::jsonb,
  'critical',
  true,
  true,
  true,
  60,
  1
) ON CONFLICT (id) DO NOTHING;

-- 2. Adicionar ações para o playbook de processo suspeito
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
  'Envia notificação sobre o processo detectado para análise',
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
  'Isolar máquina',
  'Coloca a máquina em quarentena de rede',
  '{"notify_user": true}'::jsonb,
  'high'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Criar playbook para serviço não autorizado
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
  'Serviço Não Autorizado',
  'Responde quando um serviço não autorizado é detectado em execução',
  'unauthorized_service',
  '{"service_state": "running", "authorized": false}'::jsonb,
  'high',
  true,
  true,
  true,
  30,
  1
) ON CONFLICT (id) DO NOTHING;

-- 4. Adicionar ações para playbook de serviço não autorizado
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
  'Alertar sobre serviço',
  'Envia alerta sobre o serviço não autorizado',
  '{"channel": "all"}'::jsonb,
  'low'
),
(
  'b7100000-0000-0000-0000-000000000002',
  'a7000000-0000-0000-0000-000000000007',
  2,
  'stop_service',
  'Parar serviço',
  'Para o serviço imediatamente',
  '{}'::jsonb,
  'high'
),
(
  'b7100000-0000-0000-0000-000000000003',
  'a7000000-0000-0000-0000-000000000007',
  3,
  'disable_service',
  'Desabilitar serviço',
  'Desabilita o serviço permanentemente para prevenir reinício',
  '{}'::jsonb,
  'high'
)
ON CONFLICT (id) DO NOTHING;

-- 5. Adicionar ação restart_service ao playbook de Computador Offline
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
  'Reiniciar serviço do agente',
  'Tenta reiniciar o serviço CyberShield no computador',
  '{"service_name": "CyberShieldAgent"}'::jsonb,
  'medium'
)
ON CONFLICT (id) DO NOTHING;