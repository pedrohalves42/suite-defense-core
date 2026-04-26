-- Fase 1: Ativar auto-execucao em playbooks de notificacao
-- Estes playbooks tem acoes de baixo risco (notify, create_evidence)
-- e podem ser executados automaticamente sem aprovacao humana

UPDATE playbooks
SET require_approval = false, 
    updated_at = NOW()
WHERE id IN (
  'a1000000-0000-0000-0000-000000000001', -- Computador Offline ha 24h
  'a2000000-0000-0000-0000-000000000002'  -- DNS bloqueou multiplas tentativas
)
AND require_approval = true;