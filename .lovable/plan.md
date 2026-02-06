
# Correção: Force Update de Agentes Desatualizados

## Diagnóstico Confirmado

### Problema Identificado

Dois mecanismos de update que **NÃO estão sincronizados**:

```text
┌─────────────────────────────────────────────────────────────────────┐
│  MECANISMO 1: Job System (process-agent-updates cron)               │
│  ├── Cria jobs "update_agent" a cada 6 horas                        │
│  ├── Jobs estão FALHANDO (agentes v4.x não suportam job system)     │
│  └── NÃO atualiza force_update_version                              │
├─────────────────────────────────────────────────────────────────────┤
│  MECANISMO 2: Force Update via Heartbeat                            │
│  ├── Verifica force_update_version no heartbeat                     │
│  ├── Envia script atualizado diretamente no response                │
│  ├── FUNCIONA PERFEITAMENTE (Pc-Bianca-Tibery está recebendo)       │
│  └── MAS: force_update_version está NULL para 7 agentes online      │
└─────────────────────────────────────────────────────────────────────┘
```

### Evidência do Problema

| Agente | Versão Atual | force_update_version | Status |
|--------|--------------|---------------------|--------|
| pcteste1 | v4.5.0 | NULL | ONLINE - NÃO RECEBE UPDATE |
| PC-Servidor-Planalto | v4.5.0 | NULL | ONLINE - NÃO RECEBE UPDATE |
| Pc-Anna-Tibery | v4.5.0 | NULL | ONLINE - NÃO RECEBE UPDATE |
| Pc-Bianca-Tibery | v4.1.9 | **v5.0.2** | ONLINE - RECEBENDO UPDATE ✓ |
| Pc-Julianna1-Planalto | v4.5.0 | NULL | ONLINE - NÃO RECEBE UPDATE |
| Pc-Meio-Planalto | v4.5.0 | NULL | ONLINE - NÃO RECEBE UPDATE |
| Pc-Vidro-Planalto | v4.5.0 | NULL | ONLINE - NÃO RECEBE UPDATE |

---

## Solução

### Parte 1: Correção Imediata (SQL Update)

Atualizar `force_update_version = 'v5.0.2'` para todos os agentes desatualizados:

```sql
UPDATE agents 
SET 
  force_update_version = 'v5.0.2',
  force_update_reason = 'Automated rollout via force update mechanism'
WHERE status = 'active' 
  AND archived_at IS NULL
  AND agent_version != 'v5.0.2'
  AND (force_update_version IS NULL OR force_update_version != 'v5.0.2');
```

**Resultado:** Agentes online receberão o update no próximo heartbeat (~60 segundos).

### Parte 2: Correção do Cron Job (Código)

Modificar `supabase/functions/process-agent-updates/index.ts` para também atualizar o campo `force_update_version`:

**Mudança no código (após linha 143):**

```typescript
// NOVO: Além de criar job, atualizar force_update_version para ativar update via heartbeat
const { error: updateError } = await supabase
  .from('agents')
  .update({ 
    force_update_version: latest.version,
    force_update_reason: 'Automated rollout via cron job'
  })
  .eq('id', agent.id);

if (updateError) {
  logger.warn('[process-agent-updates] Failed to set force_update_version', {
    requestId,
    agentName: agent.agent_name,
    error: updateError
  });
}
```

Isso garante que o mecanismo de force update via heartbeat seja ativado em paralelo com o job system.

---

## Arquivos a Modificar

1. **Banco de Dados**: SQL update para forçar `force_update_version = 'v5.0.2'` em agentes desatualizados
2. **`supabase/functions/process-agent-updates/index.ts`**: Adicionar update de `force_update_version` quando cron detecta agentes desatualizados

---

## Resultado Esperado

Após as correções:
- 7 agentes online receberão comando de update no próximo heartbeat
- Agentes v4.x receberão script v5.0.2 diretamente no response do heartbeat
- Futuras execuções do cron também ativarão force update automaticamente
- Tempo estimado para update: 1-2 minutos após aprovação

---

## Detalhes Técnicos

O mecanismo de force update via heartbeat (linhas 215-297 do `heartbeat/index.ts`):
1. Verifica se `force_update_version` está preenchido e difere de `agent_version`
2. Busca o script da versão alvo em `agent_releases`
3. Normaliza para Windows (CRLF), calcula SHA256
4. Envia `script_content_base64`, `sha256` e `target_version` no response
5. Agente aplica o update imediatamente sem depender do job system

Este é o mecanismo mais confiável para agentes legados (v4.x) que não suportam o job system moderno.
