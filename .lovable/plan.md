
## Plano de Otimização FinOps – Crons, Polling e Alertas

### Fase 1 – Cortar/Reduzir Crons

**1.1 Desativar `honeypot-dispatch-ai`**
- Remover o cron job do pg_cron (via SQL)
- O processamento de IA do honeypot já é assíncrono via outbox; o cron dedicado é redundante

**1.2 Reduzir `evaluate-automation-rules` para 1x/dia**
- Atualizar o schedule no pg_cron de qualquer frequência atual para `0 3 * * *` (03:00 UTC, 1x/dia)

**1.3 Reduzir `honeypot-update-agent-timestamps` para 1x/hora**
- Atualizar o schedule no pg_cron para `0 * * * *` (topo de cada hora)

### Fase 2 – Reduzir Polling

**2.1 `poll-jobs`: 10s → 30s**
- Atualizar o intervalo no script do agente PowerShell (constante de polling)
- Atualizar rate limit no edge function `poll-jobs` de 6/min para 3/min (compatível com 30s)

**2.2 `purge-hmac-signatures`: 10min → 1x/dia**
- Atualizar o cron job para `0 4 * * *` (04:00 UTC, 1x/dia)

### Fase 3 – Alertas de Tenant Outlier

**3.1 Configurar cron `check-tenant-abuse` horário**
- Criar/atualizar cron job para `5 * * * *` (minuto 5 de cada hora)
- A edge function já existe e está funcional

### Fase 4 – Validação

- Verificar todos os cron jobs ativos via consulta a `cron.job`
- Confirmar que as edge functions deployam sem erros
- Validar sintaxe de todas as alterações
