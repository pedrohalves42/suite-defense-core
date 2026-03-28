-- =============================================================================
-- AJUSTES FINOS DE CONSOLIDACAO (4 ajustes)
-- =============================================================================

-- AJUSTE 1: Guard contra updates cosmeticos no trigger
-- Recriar funcao com guard no topo para maxima clareza
CREATE OR REPLACE FUNCTION create_decision_event_from_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Guard 1: Apenas mudanca real de estado resolved (primeiro!)
  IF OLD.resolved IS NOT DISTINCT FROM NEW.resolved THEN
    RETURN NEW;
  END IF;

  -- Guard 2: Apenas alertas criticos
  IF NEW.severity <> 'critical' THEN
    RETURN NEW;
  END IF;

  -- Criar decision_event para resolucao
  IF NEW.resolved = true AND OLD.resolved = false THEN
    INSERT INTO decision_events (
      tenant_id,
      decision_type,
      actor_type,
      actor_id,
      evidence,
      justification,
      human_reviewed,
      created_at
    ) VALUES (
      NEW.tenant_id,
      'alert_resolution',
      CASE 
        WHEN NEW.resolved_by IS NOT NULL THEN 'user'
        ELSE 'system'
      END,
      COALESCE(NEW.resolved_by, '00000000-0000-0000-0000-000000000000'),
      jsonb_build_object(
        'alert_id', NEW.id,
        'alert_type', NEW.alert_type,
        'severity', NEW.severity,
        'message', NEW.message,
        'resolved_at', NEW.resolved_at,
        'trigger_source', 'database_trigger'
      ),
      COALESCE(NEW.resolution_notes, 'Alert resolved'),
      NEW.resolved_by IS NOT NULL,
      COALESCE(NEW.resolved_at, now())
    );
  END IF;

  -- Criar decision_event para reabertura
  IF NEW.resolved = false AND OLD.resolved = true THEN
    INSERT INTO decision_events (
      tenant_id,
      decision_type,
      actor_type,
      actor_id,
      evidence,
      justification,
      human_reviewed,
      created_at
    ) VALUES (
      NEW.tenant_id,
      'alert_reopen',
      'system',
      '00000000-0000-0000-0000-000000000000',
      jsonb_build_object(
        'alert_id', NEW.id,
        'alert_type', NEW.alert_type,
        'severity', NEW.severity,
        'previous_resolved_at', OLD.resolved_at,
        'trigger_source', 'database_trigger'
      ),
      'Alert reopened',
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- AJUSTE 2: Indice unico em policy_assignments
-- Previne assignments duplicados
CREATE UNIQUE INDEX IF NOT EXISTS uniq_policy_assignment
ON policy_assignments (policy_id, target_type, target_id);

-- AJUSTE 3: Renomear funcao para clareza conceitual
-- get_reason_tree_for_alert ? get_alert_decision_chain
ALTER FUNCTION get_reason_tree_for_alert(uuid) RENAME TO get_alert_decision_chain;

-- AJUSTE 4: Documentar relacao entre funcoes
COMMENT ON FUNCTION get_alert_decision_chain(uuid) IS 
'Returns the causal decision chain for a specific alert.
Distinct from generate_audit_reason_tree() which explains the overall ANA score.
- get_alert_decision_chain: "Why was THIS alert resolved?"
- generate_audit_reason_tree: "Why is the ANA score X/100?"
Created as part of ANA shock plan consolidation.';