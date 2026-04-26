-- FASE 10: Permitir arquivamento de jobs falhos e limpar DLQ historico

-- 1. Atualizar o trigger para permitir transicao de failed -> archived
CREATE OR REPLACE FUNCTION public.enforce_job_state_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_valid_transitions jsonb := '{
    "pending": ["queued", "cancelled", "failed"],
    "queued": ["delivered", "failed", "cancelled"],
    "delivered": ["completed", "failed", "cancelled"],
    "completed": ["archived"],
    "failed": ["archived"],
    "cancelled": ["archived"]
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
$function$;

-- 2. Arquivar jobs falhos com mais de 7 dias
UPDATE jobs
SET status = 'archived'
WHERE status = 'failed'
  AND created_at < NOW() - INTERVAL '7 days';

-- 3. Limpar scheduled_job_runs falhos antigos (mais de 30 dias)
DELETE FROM scheduled_job_runs
WHERE success = false 
  AND ran_at < NOW() - INTERVAL '30 days';

-- Comentario
COMMENT ON FUNCTION enforce_job_state_transitions() IS 'Enforce valid state machine transitions for jobs. States: pending -> queued -> delivered -> completed. Terminal states (failed, cancelled, completed) can transition to archived.';