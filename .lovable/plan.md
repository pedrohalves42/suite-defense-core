

# Plano: Finalizar Pendencias da Auditoria

## Estado Atual (verificado no código)

| Item | Status Real | Detalhes |
|---|---|---|
| Decomposição JobCreator | DONE | 6 arquivos em `src/pages/JobCreator/` |
| Decomposição RolloutPolicies | DONE | 7 arquivos em `src/pages/super-admin/RolloutPolicies/` |
| B1: admin-create-user | DONE | Já usa `serveTenant` |
| B1: send-invite | DONE | Já migrado |
| B1: delete-invite | DONE | Já usa `serveTenant` |
| B1: remove-member | DONE | Já migrado |
| B1: force-reinstall-fleet | DONE | Já migrado |
| B1: create-job | DONE | Já migrado |
| B1: quarantine-agent | N/A | Usa `assertInternalCaller` (interno/cron) — deve permanecer |
| B1: apply-security-patch | N/A | Usa `assertInternalCaller` (interno/cron) — deve permanecer |
| B1: build-agent-exe | PENDING | 1060 linhas, `Deno.serve`, auth JWT manual |
| AI Router | PARCIAL | Proxy criado, mas não consolida (16 funções individuais permanecem) |
| `as any` no frontend | 1.353 ocorrências em 159 arquivos | Nenhuma eliminada |
| Edge functions Deno.serve | ~148 funções | ~80 migradas, ~57 internal, ~12 HMAC |

---

## Pendencias Reais a Executar (em ordem)

### 1. Migrar `build-agent-exe` para `serveTenant` (B1 final)

**Problema:** 1060 linhas com `Deno.serve`, auth manual, GET health check + POST build.

**Ação:**
- Modularizar em `build-agent-exe/index.ts` (orquestrador ~100L) + módulos: `validation.ts`, `cache.ts`, `build-executor.ts`, `installer-generator.ts`
- Migrar para `serveTenant` com opção `methods: ['GET', 'POST']`
- GET health check pode ser tratado antes do middleware ou via `servePublic` separado
- Manter a lógica complexa intacta, apenas trocar boilerplate

### 2. AI Router — Consolidação Real (16 → 1 função)

**Estado atual:** `ai-router/index.ts` é um proxy HTTP que reencaminha para as funções individuais. Não consolida.

**Ação:** Para cada uma das 16 funções AI que ainda usam `Deno.serve`:
1. Extrair a lógica de negócio para `ai-router/handlers/<action>.ts`
2. Cada handler exporta uma função `(ctx, payload) => Promise<Response>`
3. O roteador importa e despacha diretamente (sem fetch HTTP)
4. Remover funções individuais após migração

**Funções a consolidar:**
- `auto-execute-ai-actions` (Deno.serve)
- `auto-triage-insights` (Deno.serve)
- As 14 já migradas para serveTenant continuam como estão; o router passa a chamá-las diretamente

**Estrutura:**
```text
supabase/functions/ai-router/
├── index.ts              (dispatcher, ~80 linhas)
├── handlers/
│   ├── analyze-agent.ts
│   ├── security-copilot.ts
│   ├── correlate-alerts.ts
│   └── ... (16 handlers)
└── shared/
    └── types.ts
```

### 3. Migração Edge Functions Restantes (Batches B2-B8)

**~70 funções** restantes com `Deno.serve` (excluindo internal e HMAC). Executar em batches:

| Batch | Funções | Prioridade |
|---|---|---|
| B3: Relatórios/Compliance | `generate-compliance-report`, `generate-security-report`, `generate-executive-report`, etc. (9 funções) | Alta |
| B5: Agent submit (non-HMAC) | `submit-network-info`, `submit-vuln-findings`, `submit-agent-evidence`, etc. (9 funções) | Alta |
| B6: Admin reads | `list-all-users-admin`, `get-web-activity`, `block-website`, etc. (7 funções) | Média |
| B7: Public/Webhook | `submit-contact`, `health`, `build-callback`, etc. (5 funções) | Média |
| B8: Diversos | `notification-dispatcher`, `send-*`, `sync-*`, etc. (~20 funções) | Baixa |

**Padrão por função:**
1. Substituir `Deno.serve` por `serveTenant`/`serveAgent`/`servePublic`
2. Remover CORS boilerplate, `createClient()` manual, auth manual
3. Usar `ctx.supabase`, `ctx.tenantId`, `ctx.userId`, `ctx.body`
4. Adicionar validação Zod no body

### 4. Eliminação de `as any` no Frontend

**1.353 ocorrências em 159 arquivos.** Abordagem por categoria:

| Categoria | ~Ocorrências | Solução |
|---|---|---|
| RPC results `(data as any as Type[])` | ~400 | Criar helper `typedRpc<T>()` ou cast via `unknown` |
| Testes `(mock as any)` | ~300 | Criar factories tipadas, usar `Partial<T>` |
| Supabase SDK limitation `from('table' as any)` | ~100 | Manter com `// eslint-disable` (limitação SDK) |
| JSON fields `(data.field as any)` | ~200 | Zod parse ou interfaces explícitas |
| Componentes admin (views, props) | ~350 | Tipagem explícita |

**Execução em 8 batches de ~20 arquivos:**
1. `src/hooks/` (44 arquivos, 487 ocorrências) — maior impacto
2. `src/pages/admin/` (33 arquivos, 255 ocorrências)
3. `src/components/admin/` 
4. `src/pages/super-admin/`
5. `src/infrastructure/`
6. `src/lib/`
7. Testes (`*.test.tsx`)
8. Restantes

### 5. Testes de Integração para Funções Críticas

Criar testes Deno para 30 funções, priorizando:
- Agent lifecycle: `heartbeat`, `poll-jobs`, `submit-job-result`, `enroll-agent`
- Telemetry: `submit-system-metrics`, `submit-software-inventory`
- Security: `scan-vulnerabilities`, `send-security-alert`
- Admin: `admin-create-user`, `create-job`

### 6. Infraestrutura (Fase 3)

- Dead-letter queue: tabela `dead_letter_jobs` + lógica em `process-failed-jobs`
- Rate limiting: integrar `checkRateLimit` no `serveTenant` como opt-in
- Cache: tabela `kv_cache` + helpers `cacheGet/cacheSet`
- Feature flags: tabela `feature_flags` + helper `isFeatureEnabled`
- Particionamento: `agent_system_metrics`, `audit_logs`, `job_executions`

---

## Ordem de Execução Recomendada

1. **build-agent-exe** — única função B1 pendente
2. **Eliminação `as any` batch 1** — `src/hooks/` (maior impacto)
3. **AI Router consolidação real** — 16 → 1 função
4. **Batches B3-B8** — migração edge functions
5. **Eliminação `as any` batches 2-8**
6. **Testes de integração**
7. **Infraestrutura** (DLQ, rate limit, cache, flags)

