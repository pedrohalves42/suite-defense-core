-- ============================================================
-- INV-STATE: State Machine Formal para Jobs
-- Impede transicoes ilegais como queued?completed
-- ============================================================

-- Funcao que valida transicoes de estado
CREATE OR REPLACE FUNCTION public.enforce_job_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valid_transitions jsonb := '{
    "queued": ["delivered", "failed", "cancelled"],
    "delivered": ["completed", "failed", "cancelled"],
    "completed": [],
    "failed": [],
    "cancelled": []
  }'::jsonb;
  v_allowed_states jsonb;
BEGIN
  -- Se status nao mudou, permitir
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Buscar transicoes validas para o estado atual
  v_allowed_states := v_valid_transitions->OLD.status;
  
  -- Verificar se o novo estado esta na lista de permitidos
  IF v_allowed_states IS NULL OR NOT v_allowed_states ? NEW.status THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Cannot transition from % to %. Allowed transitions from %: %',
      OLD.status,
      NEW.status,
      OLD.status,
      COALESCE(v_allowed_states, '[]'::jsonb)
    USING ERRCODE = '23514'; -- check_violation
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger BEFORE UPDATE para validar transicoes
DROP TRIGGER IF EXISTS trg_enforce_job_state_transitions ON jobs;
CREATE TRIGGER trg_enforce_job_state_transitions
  BEFORE UPDATE OF status ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_job_state_transitions();

-- Comentarios de documentacao
COMMENT ON FUNCTION enforce_job_state_transitions() IS 
'INV-STATE: Enforces legal state machine transitions for jobs.
Valid transitions:
  - queued ? delivered, failed, cancelled
  - delivered ? completed, failed, cancelled
  - completed ? (terminal state)
  - failed ? (terminal state)
  - cancelled ? (terminal state)
Raises SQLSTATE 23514 on illegal transition.';

COMMENT ON TRIGGER trg_enforce_job_state_transitions ON jobs IS 
'Blocks illegal state transitions. Part of Zero Trust architecture.';