

# Plano Completo: Validacao Canary v6, Telemetria, Rate Limit e Rollout da Frota

## Situacao Atual

**pcteste1**: Recebeu o script v6.0.0 e instalou com sucesso (atomic move) em 11/04 as 15:25:36. Porem, o banco ainda mostra `agent_version: v5.0.15` — o agente precisa reiniciar o servico para que o proximo heartbeat reporte v6.0.0.

**Frota total v5.0.15**: 14 agentes, sendo apenas 2 ativos (PC-Servidor-Planalto e pcteste1). Os demais estao offline.

**Rate limit heartbeat**: Configurado para `maxRequests: 10, windowMinutes: 10, blockMinutes: 2`. O agente v5 faz heartbeat a cada ~35s, gerando ~17 requests/10min — excede o limite de 10 e causa cascatas de 429 seguidas de 401.

**Ed25519**: O agente pcteste1 nunca recebeu a chave publica Ed25519 — opera em "audit-only mode" (aceita updates por SHA256 apenas).

---

## Fase 1: Confirmar Update no pcteste1

**Objetivo**: Verificar se o agente reiniciou e esta reportando v6.0.0.

1. **Consultar o banco** para verificar se `agent_version` do pcteste1 mudou para `v6.0.0`
2. **Verificar logs do heartbeat** para confirmar que o agente esta enviando heartbeats com a nova versao
3. **Se o agente NAO reiniciou** (ainda v5.0.15): O update via force_update so aplica no proximo boot do servico. Pode ser necessario aguardar ou enviar um job de `restart-service` via poll-jobs
4. **Limpar force_update** apos confirmacao: `UPDATE agents SET force_update_version = NULL WHERE id = 'd7c0e8c8...'`

---

## Fase 2: Corrigir Rate Limit do Heartbeat

**Problema identificado no log**: O agente v5 envia heartbeat a cada ~35s (intervalo padrao). Com rate limit de 10 req/10min, apos o 10o heartbeat (~5min50s), todos os seguintes recebem 429. A re-tentativa gera 401 (token expirado no cache apos rate limit).

**Correcao proposta**: Ajustar o rate limit de `maxRequests: 10, windowMinutes: 10` para `maxRequests: 30, windowMinutes: 10` — acomoda heartbeats a cada 20s sem bloqueio.

**Arquivo**: `supabase/functions/heartbeat/index.ts`, linha 104

```typescript
// DE:
{ maxRequests: 10, windowMinutes: 10, blockMinutes: 2 }
// PARA:
{ maxRequests: 30, windowMinutes: 10, blockMinutes: 2 }
```

**Alternativa mais eficiente em custo**: Manter o rate limit agressivo (10/10min) e ajustar o intervalo do heartbeat no servidor para 120s (ja esta sendo enviado na resposta: `poll_interval_seconds: 120`). O agente v6 modular respeita esse intervalo. Nenhuma mudanca de codigo necessaria — basta confirmar que o v6 aplica o intervalo corretamente.

**Decisao recomendada**: Aumentar para `maxRequests: 30` como solucao imediata para agentes v5 legados que ainda nao respeitam o intervalo do servidor, e manter o plano de migracao para v6 que respeita o intervalo dinamico.

---

## Fase 3: Verificar Telemetria nos Routers

**Objetivo**: Confirmar que EDR, processes e demais dados chegam corretamente.

1. **submit-endpoint-events**: Logs ja confirmam ingestao funcionando — `EDR ingested: 1 direct` e `181 direct` para PC-Servidor-Planalto
2. **submit-router**: Verificar logs para tipos `processes`, `backup-status`, `network-info`
3. **submit-hmac-router**: Verificar logs para tipos `antivirus`, `system-metrics`, `rollback-event`
4. **Acao**: Consultar edge function logs de ambos os routers para confirmar que nao ha erros de roteamento ou 401/500

---

## Fase 4: Rollout v6 para Toda a Frota

**Estrategia por prioridade de custo e seguranca**:

### Passo 1 — Confirmar pcteste1 saudavel em v6 (pre-requisito)
- Aguardar 2-3 ciclos de heartbeat com v6.0.0
- Confirmar que telemetria EDR continua fluindo
- Confirmar zero erros novos nos logs

### Passo 2 — Ativar PC-Servidor-Planalto (unico outro agente ativo)
```sql
UPDATE agents 
SET force_update_version = 'v6.0.0',
    force_update_reason = 'Fleet v5->v6 migration',
    force_update_at = now(),
    force_update_delivered_count = 0,
    force_update_first_delivered_at = NULL
WHERE agent_name = 'PC-Servidor-Planalto';
```

### Passo 3 — Ativar agentes offline (receberao o update quando voltarem online)
```sql
UPDATE agents 
SET force_update_version = 'v6.0.0',
    force_update_reason = 'Fleet v5->v6 migration',
    force_update_at = now(),
    force_update_delivered_count = 0,
    force_update_first_delivered_at = NULL
WHERE agent_version = 'v5.0.15' 
  AND force_update_version IS NULL;
```

### Passo 4 — Aumentar rollout_percentage para 100%
```sql
UPDATE agent_update_policies 
SET rollout_percentage = 100 
WHERE id = '0a42022f-59db-4ebe-8ead-1bae3d3b1dc0';
```

---

## Fase 5: Resolver Ed25519 (Seguranca)

O pcteste1 nunca recebeu a chave publica Ed25519. O update foi aceito apenas por SHA256. Para seguranca completa:

1. Verificar se o segredo `ED25519_PRIVATE_KEY` esta configurado nas edge functions
2. Confirmar que o heartbeat esta retornando `ed25519_public_key` na resposta
3. Verificar nos logs se "Ed25519 Public key derived successfully" aparece
4. Se a chave esta sendo enviada mas o agente nao persiste, verificar o hotfix de distribuicao de chaves no script v6

---

## Resumo de Alteracoes de Codigo

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/heartbeat/index.ts` L104 | `maxRequests: 10` → `maxRequests: 30` |
| Migration SQL | force_update_version para agentes restantes |
| Migration SQL | rollout_percentage → 100% |

---

## Criterios de Sucesso

1. pcteste1 reportando `agent_version: v6.0.0` no banco
2. Zero erros 429 nos logs do heartbeat apos ajuste de rate limit
3. Telemetria EDR chegando em submit-endpoint-events sem interrupcao
4. PC-Servidor-Planalto atualizado para v6.0.0
5. Ed25519 public key distribuida e persistida no agente

