

# Plano de Correção: V-609 e V-610 (Residual Findings)

## Resumo Executivo

Este plano corrige os dois achados residuais identificados na contra-auditoria do Dr. Vellum:

| ID | Severidade | Problema | Causa Raiz |
|----|------------|----------|------------|
| **V-610** | MEDIUM | 4.335 DLQ items resolvidos SEM `decision_event_id` | Trigger não atribui o ID de volta ao registro |
| **V-609** | LOW | `v_risk_debt_summary` sem filtro explícito de tenant | Depende apenas do filtro herdado de `v_risk_debt_active` |

---

## Análise Técnica Detalhada

### V-610: Trigger DLQ Não Atribui decision_event_id

**Evidência Encontrada**:
```sql
-- Query executada:
SELECT COUNT(*) FILTER (WHERE decision_event_id IS NULL) as sem_event_id
FROM failed_jobs_dlq WHERE status = 'resolved';

-- Resultado: 4.335 de 4.335 = 100% sem decision_event_id
```

**Causa Raiz**:
A função `create_dlq_decision_event()` atual (migration 20260131) faz o INSERT no `decision_events`, mas:
1. **NÃO usa RETURNING** para capturar o ID gerado
2. **NÃO atribui** `NEW.decision_event_id := v_event_id`

**Código Atual (Problemático)**:
```sql
INSERT INTO public.decision_events (...)
VALUES (...);  -- Sem RETURNING!
-- NEW.decision_event_id nunca é atribuído
```

**Código Corrigido**:
```sql
INSERT INTO public.decision_events (...) 
VALUES (...)
RETURNING id INTO v_event_id;  -- Captura o ID

NEW.decision_event_id := v_event_id;  -- Atribui ao registro DLQ
```

---

### V-609: View v_risk_debt_summary Sem Filtro Explícito

**Evidência Encontrada**:
```sql
-- Query executada:
SELECT viewname, 
       definition LIKE '%get_active_tenant_id%' as has_tenant_filter
FROM pg_views 
WHERE viewname = 'v_risk_debt_summary';

-- Resultado: has_tenant_filter = FALSE
```

**Causa Raiz**:
A view `v_risk_debt_summary` confia no filtro da view base `v_risk_debt_active`, mas o Dr. Vellum identifica isso como "ambiguidade auditável" - em caso de alteração da view base, o isolamento pode ser perdido silenciosamente.

**Código Atual**:
```sql
CREATE VIEW v_risk_debt_summary AS
SELECT tenant_id, count(*), ...
FROM v_risk_debt_active  -- Depende do filtro da view base
GROUP BY tenant_id;
-- Sem filtro próprio!
```

**Código Corrigido**:
```sql
CREATE VIEW v_risk_debt_summary AS
SELECT tenant_id, count(*), ...
FROM v_risk_debt_active
WHERE (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id;
```

---

## Implementação

### Correção 1: V-610 - Trigger DLQ com RETURNING

**Migration SQL**:
```sql
-- ============================================================================
-- V-610 FIX: Trigger DLQ com RETURNING para atribuir decision_event_id
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_dlq_decision_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_decision_source text;
  v_event_id uuid;  -- Variável para capturar o ID
BEGIN
  -- Só processa quando status muda para 'resolved' ou 'failed'
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('resolved', 'failed') AND OLD.status = 'pending') THEN
    v_tenant_id := NEW.tenant_id;
    
    -- Mapear resolution_source para decision_source válido
    v_decision_source := CASE 
      WHEN NEW.resolution_source = 'auto_cleanup' THEN 'system'
      WHEN NEW.resolution_source = 'human' THEN 'human'
      WHEN NEW.resolution_source = 'ai' THEN 'ai'
      WHEN NEW.resolution_source = 'policy' THEN 'policy'
      WHEN NEW.resolution_source = 'resilience_engine' THEN 'resilience_engine'
      WHEN NEW.resolved_by IS NOT NULL THEN 'human'
      ELSE 'system'
    END;
    
    -- V-610 FIX: Usar RETURNING para capturar o ID gerado
    INSERT INTO public.decision_events (
      tenant_id, 
      rule_code, 
      action, 
      evidence, 
      decision_source, 
      decision_type
    ) VALUES (
      v_tenant_id,
      'DLQ_RESOLUTION',
      'resolve_dlq_item',
      jsonb_build_object(
        'dlq_item_id', NEW.id,
        'original_job_id', NEW.original_job_id,
        'job_type', NEW.job_type,
        'error_message', NEW.error_message,
        'resolution_notes', NEW.resolution_notes,
        'resolution_source_original', NEW.resolution_source,
        'resolved_by', NEW.resolved_by
      ),
      v_decision_source,
      'system'
    ) RETURNING id INTO v_event_id;
    
    -- V-610 FIX: Atribuir o ID ao registro DLQ
    NEW.decision_event_id := v_event_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_dlq_decision_event() IS 
  'ADR-026/V-603/V-610: Trigger com search_path fixo e RETURNING para atribuir decision_event_id.';
```

---

### Correção 2: V-609 - Filtro Explícito em v_risk_debt_summary

**Migration SQL**:
```sql
-- ============================================================================
-- V-609 FIX: Adicionar filtro explícito de tenant em v_risk_debt_summary
-- ============================================================================

DROP VIEW IF EXISTS v_risk_debt_summary;
CREATE VIEW v_risk_debt_summary 
WITH (security_invoker = on) AS
SELECT 
    tenant_id,
    count(*) AS total_active,
    count(*) FILTER (WHERE severity = 'critical') AS critical_count,
    count(*) FILTER (WHERE severity = 'high') AS high_count,
    count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < (now() + '7 days'::interval)) AS expiring_soon
FROM v_risk_debt_active
WHERE (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id;

COMMENT ON VIEW v_risk_debt_summary IS 
  'ADR-026/V-609: Tenant-isolated risk debt summary com filtro EXPLÍCITO. Não depende apenas de herança.';

GRANT SELECT ON v_risk_debt_summary TO authenticated;
```

---

### Correção 3: Backfill - Atribuir decision_event_id a Registros Existentes

**Migration SQL (Data Fix)**:
```sql
-- ============================================================================
-- V-610 BACKFILL: Atribuir decision_event_id a registros DLQ existentes
-- que já têm decision_events correspondentes
-- ============================================================================

UPDATE failed_jobs_dlq dlq
SET decision_event_id = de.id
FROM decision_events de
WHERE dlq.status = 'resolved'
  AND dlq.decision_event_id IS NULL
  AND de.rule_code = 'DLQ_RESOLUTION'
  AND (de.evidence->>'dlq_item_id')::uuid = dlq.id;

-- Comentário de auditoria para registros sem correspondência
COMMENT ON TABLE failed_jobs_dlq IS 
  'DLQ com trilha de auditoria. V-610 corrigido em 2026-01-31. Registros antigos podem ter decision_event_id NULL (gap histórico).';
```

---

## Validação Pós-Implementação

### Teste V-610 (Trigger com RETURNING)

```sql
-- 1. Criar um item DLQ de teste
INSERT INTO failed_jobs_dlq (tenant_id, job_type, error_message, status)
VALUES ('seu-tenant-id', 'test_v610', 'Test error', 'pending');

-- 2. Resolver o item
UPDATE failed_jobs_dlq 
SET status = 'resolved', 
    resolution_source = 'human',
    resolution_notes = 'V-610 test'
WHERE job_type = 'test_v610';

-- 3. Verificar que decision_event_id foi atribuído
SELECT id, decision_event_id, status 
FROM failed_jobs_dlq 
WHERE job_type = 'test_v610';
-- ESPERADO: decision_event_id NÃO NULL
```

### Teste V-609 (Filtro Explícito)

```sql
-- Verificar que v_risk_debt_summary agora tem filtro próprio
SELECT definition LIKE '%get_active_tenant_id%' as has_explicit_filter
FROM pg_views 
WHERE viewname = 'v_risk_debt_summary';
-- ESPERADO: has_explicit_filter = TRUE
```

---

## Resumo de Entregáveis

| ID | Tipo | Descrição | Impacto |
|----|------|-----------|---------|
| V-610 Fix | DDL | Trigger com RETURNING + atribuição de ID | 100% dos novos DLQ terão decision_event_id |
| V-610 Backfill | DML | UPDATE para registros existentes | Vincula eventos já criados |
| V-609 Fix | DDL | WHERE explícito em v_risk_debt_summary | Elimina ambiguidade de isolamento |

---

## Seção Técnica

### Por Que o Trigger Original Não Funcionava?

A função `create_dlq_decision_event()` foi criada em migration `20260103` com `RETURNING id INTO v_event_id` e `NEW.decision_event_id := v_event_id`. Porém, na migration `20260131` (P0 fix para V-603), a função foi recriada para adicionar `SET search_path TO 'public'`, mas **sem preservar** o bloco `RETURNING`.

**Lição**: Ao modificar funções SECURITY DEFINER, sempre preservar lógica existente além de adicionar novos controles.

### Contagem Final de Gaps

| Métrica | Antes | Depois |
|---------|-------|--------|
| DLQ items sem decision_event_id | 4.335 | ~0 (backfill) + 0 (novos) |
| Views sem filtro explícito | 1 (v_risk_debt_summary) | 0 |
| Invariantes violadas | INV-005 parcial | INV-005 completa |

