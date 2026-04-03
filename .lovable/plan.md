## Bloco 5 – Crons e Polling (Custo Imediato)

### Contexto
- **poll-jobs**: O agente já usa `$Global:JobPollIntervalSeconds = 30` por padrão. O server-side pode ajustar dinamicamente via heartbeat response (`poll_interval_seconds`). O rate-limit atual é 6 req/min. **O agente JÁ está configurado para 30s** — não há mudança necessária no script.
- **evaluate-automation-rules-5min**: Não existe como cron job no `pg_cron` (lista vazia na query). É chamado event-driven por `submit-processes` e `submit-system-metrics` quando há regras ativas. O nome "5min" é legado. **Não há cron ativo para desabilitar.**

### Ações Planejadas

#### 1. Confirmar poll-jobs a 30s (Já implementado ✅)
- O agente v5.0.9+ já usa `JobPollIntervalSeconds = 30` como default
- O heartbeat response pode ajustar dinamicamente via `poll_interval_seconds`
- **Ação**: Garantir que o heartbeat edge function retorna `poll_interval_seconds: 30` explicitamente para controle server-side

#### 2. Reduzir evaluate-automation-rules para 1x/dia
- Não há cron ativo — a função é chamada event-driven por submit-processes e submit-system-metrics
- **Ação**: Adicionar rate-limiting temporal na função para não executar mais que 1x/dia por tenant (cache de última execução)
- **OU**: Criar um cron job 1x/dia e remover as chamadas inline dos submit-* (mais limpo)

#### 3. Validar consistência
- Verificar que poll-jobs rate-limit (6/min) está adequado para 30s
- Rodar lint para garantir zero erros

### Impacto de Custo
- **poll-jobs**: Já otimizado (30s default). Com COST-OPT-V6 os jobs vêm via heartbeat, poll-jobs standalone só roda como safety net (2x interval = 60s)
- **evaluate-automation-rules**: Reduzir de event-driven (potencialmente centenas/dia) para 1x/dia = **~95% redução de invocações**
