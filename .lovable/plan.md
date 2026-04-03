
# Plano: Corte de Custos Operacionais — Cron Jobs

## Problema
5 cron jobs ativos consumindo CPU/rede sem gerar valor proporcional:

| Cron Job | Schedule Atual | Invocações/dia | Problema |
|---|---|---|---|
| `honeypot-dispatch-ai` | `*/10 * * * *` | 144 | IA de honeypot é luxo sem tenants pagantes |
| `evaluate-automation-rules-5min` | NÃO ENCONTRADO | — | Já removido (não existe mais no cron.job) ✅ |
| `honeypot-update-agent-timestamps` | `*/15 * * * *` | 96 | Overkill para 47 agentes |
| `honeypot-check-alerts` | `*/5 * * * *` | 288 | Alta frequência para base pequena |
| `migrate-*-batch` (3 jobs) | `*/5 * * * *` | 864 | Migração de telemetria pode rodar menos |

## Ações

### 1. DESABILITAR `honeypot-dispatch-ai` (jobid 152)
- **Motivo**: IA de honeypot sem receita = luxo. $0 de retorno.
- **Economia**: ~144 invocações HTTP/dia eliminadas

### 2. REDUZIR `honeypot-update-agent-timestamps` (jobid 141) → 1x/hora
- **De**: `*/15 * * * *` (96x/dia)
- **Para**: `0 * * * *` (24x/dia)
- **Economia**: -75% invocações

### 3. REDUZIR `honeypot-check-alerts` (jobid 151) → 1x/hora
- **De**: `*/5 * * * *` (288x/dia)
- **Para**: `0 * * * *` (24x/dia)
- **Economia**: -92% invocações HTTP

### 4. REDUZIR `migrate-*-batch` (3 jobs: 148, 149, 150) → 1x/hora
- **De**: `*/5 * * * *` (864x/dia total)
- **Para**: `*/30 * * * *` (144x/dia total)
- **Economia**: -83% execuções de migração

### 5. AJUSTAR `poll_interval_seconds` retornado pelo `poll-jobs`
- Aumentar de ~15s para ~30s para agentes, reduzindo carga de polling

## Economia Total Estimada
- **~1.300 invocações/dia eliminadas ou reduzidas**
- **~$2-5/mês em CPU de banco + cold starts de edge functions**

## Validação
- Verificar que os cron jobs foram atualizados corretamente via `SELECT * FROM cron.job`
- Nenhuma mudança em código de edge functions (apenas schedules)
- Zero impacto em funcionalidade core (jobs, heartbeat, enroll)
