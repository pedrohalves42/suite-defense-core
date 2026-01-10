# ADR-037: Correção de Estados Inválidos do Job Engine

## Status
**Accepted** - 2026-01-10

## Contexto

Uma auditoria profunda (conduzida por Dr. Isaac K. Vellum) identificou **727 jobs (9.6%)** em estados inválidos no Job Engine. Esta é uma falha estrutural de máquina de estados, não ruído operacional.

### Problemas Identificados

| Categoria | Quantidade | Impacto |
|-----------|------------|---------|
| Jobs `pending` abandonados (>24h) | 65 | Jobs nunca executados |
| Jobs `delivered` zombies (>2h) | 11 | Agentes potencialmente travados |
| Jobs `failed` sem entrada no DLQ | ~500 | Falhas não rastreáveis |
| Jobs terminais sem `completed_at` | 144 | Métricas MTTR/SLA incorretas |
| Enrollment keys expiradas ativas | 84 | Risco de segurança |

### Causa Raiz Principal

O `ai-action-executor` criava jobs com `status: 'pending'` em vez de `status: 'queued'`, resultando em jobs que:
1. Eram marcados como `approved: true`
2. Nunca entravam na fila de execução (`claim_jobs_for_agent` busca apenas `status = 'queued'`)
3. Permaneciam abandonados indefinidamente

**Linhas afetadas**: 141, 353, 467, 495, 532 em `ai-action-executor/index.ts`

## Decisão

Implementar correções em três fases:

### Fase 0: Stop the Bleeding (Imediato)

1. **Corrigir `ai-action-executor`**: Mudar `status: 'pending'` para `status: 'queued'` em todas as 5 ocorrências
2. **Migração de dados**:
   - Cancelar jobs `pending` órfãos (usando `COALESCE(updated_at, created_at)`)
   - Backfill `completed_at` para jobs terminais
   - Cleanup zombies `delivered` >2h
   - Backfill DLQ com classificação causal
3. **Desativar enrollment keys expiradas**

### Fase 1: Prevenção (48h)

1. **Trigger `tr_ensure_completed_at`**: Garante `completed_at` em estados terminais
   - Só atua quando status **muda** para terminal (INSERT ou UPDATE com mudança de estado)
2. **Função `cleanup_stuck_pending_jobs()`**: Cron horário para cancelar jobs abandonados
3. **View `v_job_health_anomalies`**: Monitoramento contínuo de anomalias

### Fase 2: Governança

1. Health gate crítico para integridade do Job Engine
2. Documentação formal (este ADR)

## Esclarecimento sobre Audit Log Hash Chain

Durante a auditoria inicial foram identificadas inconsistências potenciais na hash chain do audit log. Uma revalidação posterior confirmou que os registros atualmente ativos estão íntegros (0 quebras detectadas). O warning pré-existente refere-se à necessidade de re-ancoragem periódica conforme ADR-036, não a quebras ativas no momento da correção.

## Consequências

### Positivas

- ✅ Jobs criados pela IA serão executados corretamente
- ✅ Integridade temporal garantida por trigger
- ✅ Falhas rastreáveis no DLQ com classificação causal
- ✅ Monitoramento proativo de anomalias
- ✅ Enrollment keys expiradas desativadas

### Negativas

- ⚠️ Dados históricos corrigidos podem não refletir estado original exato
- ⚠️ Jobs cancelados automaticamente podem incluir casos legítimos (mitigado pelo uso de `updated_at`)

## Métricas de Sucesso

Após correção, todos os valores devem ser **0**:

```sql
SELECT * FROM v_job_health_anomalies WHERE count > 0;
```

| Métrica | Antes | Depois |
|---------|-------|--------|
| Jobs em estados inválidos | 727 | 0 |
| Jobs pending abandonados | 65 | 0 |
| Falhas não rastreadas (DLQ) | 501 | 0 |
| Jobs sem completed_at | 144 | 0 |
| Zombies delivered | 11 | 0 |
| Enrollment keys expiradas ativas | 84 | 0 |

## Validação

```sql
-- Confirmar cleanup
SELECT status, COUNT(*) FROM jobs GROUP BY status ORDER BY count DESC;

-- Confirmar enrollment keys
SELECT COUNT(*) FROM enrollment_keys 
WHERE expires_at < NOW() AND is_active = true;
-- Esperado: 0

-- Confirmar DLQ completude
SELECT 
  (SELECT COUNT(*) FROM jobs WHERE status = 'failed') as failed_jobs,
  (SELECT COUNT(*) FROM failed_jobs_dlq) as dlq_entries;
-- Valores devem ser próximos
```

## Arquivos Modificados

1. `supabase/functions/ai-action-executor/index.ts` - 5 ocorrências corrigidas
2. Migração SQL aplicada (jobs + enrollment_keys + triggers)
3. `docs/adr/ADR-037-job-engine-correction.md` - Este documento

## Referências

- ADR-024: Task Engine
- ADR-036: Audit Log Integrity
- Auditoria Dr. Vellum (2026-01-10)

---

**Aprovado por**: Equipe de Engenharia  
**Data de Implementação**: 2026-01-10
