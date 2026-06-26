# Bloco D12-B4 — `alert-engine.ts` cleanup result

**Status:** ✅ Concluído
**Escopo:** remoção da diretiva `@ts-nocheck` em `supabase/functions/_shared/submit-handlers/alert-engine.ts`.

## Arquivo alterado

| Arquivo | Mudança |
| --- | --- |
| `supabase/functions/_shared/submit-handlers/alert-engine.ts` | Removida diretiva `// @ts-nocheck`. Removido import não utilizado `SupabaseClient` (era importado apenas para documentar o tipo, nunca referenciado — `supabase` é `any` na assinatura atual). Cabeçalho JSDoc atualizado com nota de auditoria D12-B4. |

## Diretiva removida

1 diretiva ativa.

## Erros encontrados

`deno check` no alvo após a remoção: **0 erros**. Não foi necessário adicionar nenhuma anotação de tipo. O arquivo já carregava interfaces locais (`AlertThresholdInput`, `AgentRef`) e tipagem explícita em variáveis chave; a configuração do `deno.json` do projeto não exige `noImplicitAny`, então callbacks internos (`existingAlerts.some(a => ...)`) permanecem aceitos sem alteração.

## Alterações type-only feitas

Nenhuma além da remoção da diretiva e do import órfão. Nenhuma assinatura pública mudou:

- `generateAlerts(supabase: any, agent: AgentRef, metrics: AlertThresholdInput): Promise<number>` — inalterada.
- `autoResolveAlerts(supabase: any, agentId: string, metrics: AlertThresholdInput): Promise<void>` — inalterada.

## Runtime preservado (auditoria item a item)

- **Regras de alerta**: thresholds `cpu > 98`, `memory > 90`, `disk > 97`, `85 < memory <= 90` (warning) — todos inalterados.
- **Severity mapping**: `high_cpu=critical`, `high_memory=high`, `high_disk=critical`, `memory_warning=medium` — inalterado.
- **Deduplicação**: janela de 24h via `created_at`, cooldown `ALERT_COOLDOWN_MINUTES=60`, predicado `hasRecentAlert` (não resolvido + dentro do cooldown) — inalterado.
- **Tenant/agent binding**: `tenant_id` e `agent_id` propagados em todo insert/select/update — inalterado.
- **Payload persistido**: campos `tenant_id`, `agent_id`, `alert_type`, `severity`, `title`, `message`, `details` — inalterado.
- **Tabela**: `system_alerts` (select / insert / update) — inalterada.
- **Auto-resolve**: critérios `cpu < 90`, `memory < 80`, `disk <= 95`; filtro `resolved=false`, `severity in (low, medium, high)`, `alert_type in (...)`; campos `resolved`, `resolved_at`, `resolution_notes` — inalterados.
- **Logs**: mesmas mensagens em `logger.error` / `logger.info`, mesmas condições.
- **Contrato com submit handlers**: assinaturas exportadas idênticas; consumer único (`system-metrics.ts`) chama sem mudanças.

## Consumer validado

Único consumer (via `rg`):

```
supabase/functions/_shared/submit-handlers/system-metrics.ts:7
  import { generateAlerts, autoResolveAlerts } from './alert-engine.ts';
```

Validação:

```
deno check supabase/functions/_shared/submit-handlers/alert-engine.ts    → OK
deno check supabase/functions/_shared/submit-handlers/system-metrics.ts  → OK
```

Nenhuma alteração feita no consumer.

## Gate expandido

`scripts/guard-no-ts-nocheck-tier1.sh` agora protege +1 path:

```
supabase/functions/_shared/submit-handlers/alert-engine.ts
```

Total protegido: **32 arquivos**. Execução:

```
bash scripts/guard-no-ts-nocheck-tier1.sh
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

## Diretivas `_shared` restantes (4)

```
supabase/functions/_shared/ai-multi-provider.ts
supabase/functions/_shared/dlq.ts
supabase/functions/_shared/domain-events.ts
supabase/functions/_shared/hexagonal/adapters.ts
```

Bate com o esperado pelo veredito (`4 diretivas ativas restantes em _shared`).

## Próximo alvo

**D12-B5 — `supabase/functions/_shared/dlq.ts`** (Onda 2 Operational, classificado como passante no inventário D12-A).
