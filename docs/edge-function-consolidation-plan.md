# Edge Function Consolidation Plan (232 → <60)

## Status: 🟡 Em andamento
## Impacto: Reduz cold starts ~70%, custo de invocação ~60%, complexidade de deploy

---

## Inventário Atual

| Métrica | Valor |
|---|---|
| Total de funções | 232 |
| Routers/Gateways existentes | 13 |
| Funções standalone | 219 |
| Chamadas diretas do frontend | 77 (supabase.functions.invoke) + 21 (URL direta) |
| Funções já mapeadas nos gateways | ~170 (api-gateway + ops-gateway) |

### Gateways Existentes (2 — consolidam ~170 ações)
| Gateway | Namespaces | Ações Mapeadas |
|---|---|---|
| **api-gateway** | admin, billing, security, build, agent | ~103 ações |
| **ops-gateway** | check, sync, playbook, report, cleanup, notify | ~67 ações |

### Routers Especializados (5 — com handlers inline)
| Router | Tipo | Status |
|---|---|---|
| **ai-router** | Direct dispatch + proxy | ✅ Manter (middleware diferente: serveTenant) |
| **cleanup-router** | Handler modules inline | ✅ Manter (switch/case com lógica complexa) |
| **notification-router** | Proxy dispatch | ✅ Manter (5 sub-ações) |
| **submit-router** | Agent telemetry | ✅ Manter (serveAgent middleware) |
| **collect-router** | Agent data collection | ✅ Manter (serveAgent middleware) |

### Deprecated Proxy Routers (5 — a remover)
| Router | Proxy Para | Status |
|---|---|---|
| admin-router | api-gateway admin:* | 🗑️ Remover (proxy puro) |
| agent-mgmt-router | api-gateway agent:* | 🗑️ Remover (proxy puro) |
| build-router | api-gateway build:* | 🗑️ Remover (proxy puro) |
| playbook-router | ops-gateway playbook:* | 🗑️ Remover (proxy puro) |
| report-router | ops-gateway report:* | 🗑️ Remover (proxy puro) |

### ops-router (meta-router — a remover)
Proxies para api-gateway e ops-gateway. Camada desnecessária se frontend chamar gateways diretamente.

---

## Arquitetura Alvo (~52 funções)

### Tier 1: Gateways (2 funções)
Estes já consolidam ~170 ações via namespace dispatch:
- **api-gateway** — admin, billing, security, build, agent
- **ops-gateway** — check, sync, playbook, report, cleanup, notify

### Tier 2: Routers Especializados (5 funções)
Middleware diferente ou lógica inline complexa:
- **ai-router** (serveTenant — 11 sub-ações AI)
- **cleanup-router** (handler modules — 9 sub-ações)
- **notification-router** (5 sub-ações)
- **submit-router** (serveAgent — telemetry)
- **collect-router** (serveAgent — agent data)

### Tier 3: Funções HMAC/Agent (8 funções — não consolidáveis)
Requerem raw body para verificação HMAC ou fluxo de auth triple:
- heartbeat, poll-jobs, submit-job-result, submit-processes
- register-agent-key, enroll-agent
- validate-hmac-signature, track-installation-event

### Tier 4: Auth/Protocol Especial (5 funções)
Protocolos específicos incompatíveis com router pattern:
- stripe-webhook (Stripe signature verification)
- saml-sso (SAML XML handling)
- scim-provisioning (SCIM protocol)
- fido2-register, fido2-authenticate (WebAuthn)

### Tier 5: Public/Static endpoints (8 funções)
Endpoints GET públicos ou servindo arquivos estáticos:
- health (health check leve)
- serve-installer, get-diagnostic-script, get-latest-agent-script
- get-reinstall-by-name, get-reinstall-script, get-reinstall-preserve-script
- post-installation-telemetry

### Tier 6: Funções que DEVEM ser absorvidas pelos gateways (~170+)
Já mapeadas mas ainda existem como funções individuais.
O gateway faz proxy HTTP para elas — **o objetivo é converter proxy → handler inline**.

### Contagem Final Alvo
| Tier | Count |
|---|---|
| Gateways | 2 |
| Routers especializados | 5 |
| HMAC/Agent | 8 |
| Auth/Protocol | 5 |
| Public/Static | 8 |
| **Subtotal (mantidos)** | **28** |
| Handlers internos dos routers (não contam como funções separadas) | ~170 |
| **Funções a REMOVER** | **~204** |

> ⚠️ Meta conservadora: **<60 funções** (permite buffer para novas funcionalidades)

---

## Plano de Execução

### Fase 1: Remover Proxy Routers Deprecated (6 funções) ✅ Baixo risco
**Duração**: 1 sprint

1. Verificar que NENHUM chamador usa diretamente estes endpoints:
   ```bash
   grep -rn "admin-router\|agent-mgmt-router\|build-router\|playbook-router\|report-router\|ops-router" src/ supabase/functions/
   ```

2. Atualizar qualquer chamador remanescente para usar api-gateway/ops-gateway diretamente.

3. Manter os proxies por 30 dias com log de deprecação (já têm).

4. Remover:
   - `admin-router/` → chamadores usam `api-gateway` com `admin:*`
   - `agent-mgmt-router/` → `api-gateway` com `agent:*`
   - `build-router/` → `api-gateway` com `build:*`
   - `playbook-router/` → `ops-gateway` com `playbook:*`
   - `report-router/` → `ops-gateway` com `report:*`
   - `ops-router/` → chamadores usam gateways diretamente

5. Atualizar CI exception list (`ci/validate-middleware.sh`).

**Validação**:
```bash
# Nenhuma referência direta restante
grep -rn "admin-router\|agent-mgmt-router\|build-router\|playbook-router\|report-router" src/
# Testes de integração passam via gateways
```

### Fase 2: Converter Proxy-to-Function → Inline Handlers (Batch 1: ~50 funções)
**Duração**: 2-3 sprints

Os gateways atualmente fazem `fetch(SUPABASE_URL/functions/v1/target-fn)` — isso causa um **cold start adicional** no target. Converter para handler inline elimina o hop.

**Prioridade por volume de chamadas (analytics)**:
1. **admin namespace** (13 ações) — mais chamadas do frontend
2. **billing namespace** (17 ações) — checkout, subscription
3. **check namespace** (20 ações) — cron jobs frequentes

**Pattern de conversão**:
```typescript
// ANTES (api-gateway proxies para admin-create-user)
'admin:create-user': 'admin-create-user', // proxy fetch

// DEPOIS (handler inline no api-gateway)
'admin:create-user': async (supabase, payload, ctx) => {
  // Lógica movida de admin-create-user/index.ts
  return { success: true, data: result };
},
```

**Para cada função convertida**:
1. Mover lógica core para `supabase/functions/_shared/handlers/{namespace}/{action}.ts`
2. Importar no gateway como handler inline
3. Manter a função original como proxy por 14 dias (backward compat)
4. Remover após zero calls confirmado via analytics

### Fase 3: Converter Proxy-to-Function → Inline Handlers (Batch 2: ~60 funções)
**Duração**: 2-3 sprints

- **security namespace** (28 ações)
- **agent namespace** (20 ações)
- **build namespace** (14 ações)

### Fase 4: Converter Proxy-to-Function → Inline Handlers (Batch 3: ~60 funções)
**Duração**: 2-3 sprints

- **playbook namespace** (18 ações)
- **sync namespace** (16 ações)
- **report namespace** (8 ações)

### Fase 5: Migrar chamadores do frontend (paralelo com Fases 2-4)
**Duração**: Contínuo

77 chamadas `supabase.functions.invoke('nome-direto')` precisam migrar para:
```typescript
// ANTES
supabase.functions.invoke('create-job', { body: payload })

// DEPOIS (via api-gateway)
supabase.functions.invoke('api-gateway', {
  body: { action: 'agent:create-job', payload }
})
```

**Criar helper centralizado**:
```typescript
// src/lib/gateway.ts
export async function callGateway(
  namespace: string,
  action: string,
  payload?: Record<string, unknown>
) {
  const gateway = ['admin','billing','security','build','agent'].includes(namespace)
    ? 'api-gateway' : 'ops-gateway';
  
  const { data, error } = await supabase.functions.invoke(gateway, {
    body: { action: `${namespace}:${action}`, payload: payload ?? {} }
  });
  if (error) throw error;
  return data;
}
```

### Fase 6: Cleanup e Validação Final
**Duração**: 1 sprint

1. Deletar todas as funções standalone absorvidas
2. Atualizar `docs/deno-serve-migration-exceptions.md`
3. Atualizar `ci/validate-middleware.sh` exception list
4. Atualizar `scripts/inventory_deno_serve.py`
5. Run full integration test suite
6. Verificar analytics: zero calls para funções removidas

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Gateway fica muito grande (>1000L) | Handlers em `_shared/handlers/` importados dinamicamente |
| Cold start do gateway piora com mais código | Lazy import dos handlers; bundle splitting |
| Breaking change em chamadores | 30 dias de proxy backward compat |
| Timeout do gateway (muitas ações) | Timeout por namespace (admin: 25s, build: 60s, report: 90s) |
| Erro de deploy afeta todas as ações | Deploy canary; health check por namespace |

---

## Métricas de Sucesso

| Métrica | Atual | Alvo | Como Medir |
|---|---|---|---|
| Total de funções | 232 | <60 | `ls supabase/functions/ \| wc -l` |
| Cold starts/hora | ~500 | <150 | Edge function analytics |
| Latência p95 | ~4.3s | <500ms | Edge function analytics |
| Deploy time | ~15min | <5min | CI pipeline duration |
| Custo invocação/mês | baseline | -60% | Billing dashboard |

---

## Cronograma

| Fase | Sprint | Funções Removidas | Acumulado |
|---|---|---|---|
| 1 - Proxy routers | S1 | 6 | 226 |
| 2 - Admin/Billing/Check inline | S2-S4 | ~50 | ~176 |
| 3 - Security/Agent/Build inline | S5-S7 | ~60 | ~116 |
| 4 - Playbook/Sync/Report inline | S8-S10 | ~60 | ~56 |
| 5 - Frontend migration | S2-S10 | (parallel) | — |
| 6 - Cleanup | S11 | final | <52 |

---

## Quick Wins (executáveis agora)

### 1. Remover os 5 proxy routers deprecated + ops-router
Estes são proxies puros que adicionam latência sem valor:
- admin-router, agent-mgmt-router, build-router, playbook-router, report-router, ops-router

### 2. Criar `src/lib/gateway.ts` helper
Centralizar chamadas para facilitar migração gradual do frontend.

### 3. Verificar se há chamadas diretas que já poderiam usar gateways
As 77 chamadas `invoke('nome')` do frontend — muitas já têm mapeamento nos gateways.
