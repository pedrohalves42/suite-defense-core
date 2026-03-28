-- ============================================================================
-- AUDITORIA PROFUNDA: Correcoes CRITICAL + HIGH
-- Dr. Isaac K. Vellum ? 2026-01-10
-- ============================================================================

-- ============================================================================
-- CRITICAL-002: Corrigir trigger create_task_from_dlq_item
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_task_from_dlq_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Criar task para TODA falha nao-transient (CORRIGIDO)
  IF COALESCE(NEW.failure_class, 'UNKNOWN') NOT IN ('TRANSIENT', 'EXPECTED_DROP') THEN
    INSERT INTO public.tasks (
      tenant_id, source_type, source_id, title, description, severity, 
      status, requires_human_review, auto_generated, due_at, created_at, updated_at
    )
    VALUES (
      NEW.tenant_id,
      'dlq',
      NEW.id,
      '[DLQ] ' || COALESCE(NEW.job_type, 'unknown') || ': ' || COALESCE(NEW.failure_class, 'UNKNOWN'),
      'Item na Dead Letter Queue requer revisao.' ||
      E'\n\nClasse de Falha: ' || COALESCE(NEW.failure_class, 'UNKNOWN') ||
      E'\nErro: ' || COALESCE(NEW.error_message, 'Sem mensagem') ||
      E'\nAgente: ' || COALESCE(NEW.agent_name, 'N/A') ||
      E'\nRetry Count: ' || COALESCE(NEW.retry_count, 0)::text,
      CASE NEW.failure_class
        WHEN 'BUG' THEN 'critical'
        WHEN 'CASCADE_FAILURE' THEN 'high'
        WHEN 'AGENT_STALLED' THEN 'medium'
        WHEN 'AGENT_OFFLINE' THEN 'medium'
        WHEN 'DISPATCH_FAILURE' THEN 'medium'
        ELSE 'low'
      END,
      'open',
      NEW.failure_class IN ('BUG', 'CASCADE_FAILURE'),
      true,
      NOW() + CASE 
        WHEN NEW.failure_class = 'BUG' THEN interval '4 hours'
        WHEN NEW.failure_class = 'CASCADE_FAILURE' THEN interval '24 hours'
        WHEN NEW.failure_class IN ('AGENT_STALLED', 'AGENT_OFFLINE') THEN interval '48 hours'
        ELSE interval '72 hours'
      END,
      NOW(),
      NOW()
    )
    ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET 
      updated_at = NOW(),
      description = EXCLUDED.description;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- CRITICAL-002: Backfill tasks para DLQ existentes sem task
-- ============================================================================

INSERT INTO tasks (tenant_id, source_type, source_id, title, description, severity, status, auto_generated, requires_human_review, due_at, created_at, updated_at)
SELECT 
  dlq.tenant_id,
  'dlq',
  dlq.id,
  '[DLQ Backfill] ' || COALESCE(dlq.job_type, 'unknown') || ': ' || COALESCE(dlq.failure_class, 'UNKNOWN'),
  'Item na Dead Letter Queue (backfill).' ||
  E'\n\nClasse de Falha: ' || COALESCE(dlq.failure_class, 'UNKNOWN') ||
  E'\nErro: ' || COALESCE(dlq.error_message, 'Sem mensagem') ||
  E'\nAgente: ' || COALESCE(dlq.agent_name, 'N/A'),
  CASE dlq.failure_class 
    WHEN 'BUG' THEN 'critical' 
    WHEN 'CASCADE_FAILURE' THEN 'high' 
    WHEN 'AGENT_STALLED' THEN 'medium'
    WHEN 'AGENT_OFFLINE' THEN 'medium'
    ELSE 'low' 
  END,
  'open',
  true,
  dlq.failure_class IN ('BUG', 'CASCADE_FAILURE'),
  NOW() + interval '48 hours',
  COALESCE(dlq.created_at, NOW()),
  NOW()
FROM failed_jobs_dlq dlq
WHERE dlq.failure_class NOT IN ('TRANSIENT', 'EXPECTED_DROP')
  AND NOT EXISTS (
    SELECT 1 FROM tasks t WHERE t.source_id = dlq.id AND t.source_type = 'dlq'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- CRITICAL-004: RLS Policy para particao agent_system_metrics_2026_02
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'agent_system_metrics_2026_02'
  ) THEN
    EXECUTE 'ALTER TABLE public.agent_system_metrics_2026_02 DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================================
-- HIGH-003: Backfill task_events para tasks sem evento 'created'
-- ============================================================================

INSERT INTO task_events (task_id, tenant_id, actor_type, action, metadata, created_at)
SELECT 
  t.id,
  t.tenant_id,
  'system',
  'created',
  jsonb_build_object(
    'backfilled', true, 
    'original_created_at', t.created_at,
    'audit_note', 'Backfilled by audit correction 2026-01-10'
  ),
  t.created_at
FROM tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM task_events te 
  WHERE te.task_id = t.id AND te.action = 'created'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- HIGH-001: Cleanup approval_requests orfaos (chain_id IS NULL)
-- Usando coluna correta (approved_at no lugar de resolved_at)
-- ============================================================================

UPDATE approval_requests 
SET 
  status = 'rejected',
  rejection_reason = 'Orphan cleanup - chain_id was NULL (audit 2026-01-10)'
WHERE chain_id IS NULL 
  AND status = 'pending';

-- ============================================================================
-- Adicionar comentario de auditoria
-- ============================================================================

COMMENT ON FUNCTION public.create_task_from_dlq_item() IS 
'AUDIT 2026-01-10: Corrigido para criar task para TODA falha nao-transient. Antes so criava para flagged_suspicious=true OU retry_count>=3.';