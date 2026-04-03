
# Plano: Otimização de Crons e Custos Operacionais

## Diagnóstico Atual (25 cron jobs ativos, ~450 execuções/dia)

### Problemas Identificados

| # | Job ID | Problema | Frequência Atual | Execuções/Dia |
|---|--------|----------|-------------------|---------------|
| 1 | 139 | **DUPLICADO** de 136 (`aggregate_honeypot_hourly_stats` vs `aggregate_honeypot_hourly`) | `5 * * * *` | 24 |
| 2 | 135 | **EXCESSIVO** — purge HMAC para apenas 15 assinaturas | `*/10 * * * *` | **144** |
| 3 | 152 | Já desabilitado (Feb 31) — `honeypot-dispatch-ai` | `0 0 31 2 *` | 0 |
| 4 | 141 | Honeypot agent timestamps — **já está 1x/hora** (OK) | `0 * * * *` | 24 |
| 5 | — | `evaluate-automation-rules` — **não está em pg_cron** (possivelmente via system-maintenance) | — | — |

### Ações

#### 1. Remover cron duplicado (jobid 139)
- `aggregate_honeypot_hourly_stats` é redundante com `aggregate_honeypot_hourly` (jobid 136)
- **Economia: -24 execuções/dia**

#### 2. Reduzir purge-hmac-signatures (jobid 135) de `*/10` para `0 4 * * *` (1x/dia)
- Apenas 15 assinaturas no banco — limpeza a cada 10min é desperdício puro
- **Economia: -143 execuções/dia**

#### 3. Confirmar honeypot-dispatch-ai (jobid 152) permanece desabilitado
- Já usando schedule impossível (`Feb 31`) — nenhuma ação necessária

#### 4. Honeypot agent timestamps (jobid 141) — já está 1x/hora
- A frequência solicitada (1x/hora) já é a atual — nenhuma ação necessária

#### 5. Consolidar honeypot-alerts check (jobid 151) de 1x/hora para 1x/6h
- Alertas de honeypot não precisam de verificação horária sem volume real
- **Economia: -20 execuções/dia**

### Resultado Esperado

| Métrica | Antes | Depois | Economia |
|---------|-------|--------|----------|
| Execuções/dia | ~450 | ~263 | **~42% redução** |
| Crons duplicados | 1 | 0 | -1 job |
| Crons com frequência excessiva | 2 | 0 | Otimizados |

### Implementação
- Uma única migration SQL usando `cron.unschedule()` e `cron.schedule()` para ajustar frequências
