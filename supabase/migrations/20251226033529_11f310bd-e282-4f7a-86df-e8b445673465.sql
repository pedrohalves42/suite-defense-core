-- Fase 1: Ativar auto-execução em playbooks de notificação
-- Estes playbooks têm ações de baixo risco (notify, create_evidence)
-- e podem ser executados automaticamente sem aprovação humana

UPDATE playbooks
SET require_approval = false, 
    updated_at = NOW()
WHERE id IN (
  'a1000000-0000-0000-0000-000000000001', -- Computador Offline há 24h
  'a2000000-0000-0000-0000-000000000002'  -- DNS bloqueou múltiplas tentativas
)
AND require_approval = true;