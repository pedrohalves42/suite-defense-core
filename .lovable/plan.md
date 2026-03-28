

# Plano Final: Conclusão da Auditoria CyberShield

## Visão Geral

Restam 3 frentes principais: migração de ~70 edge functions com `Deno.serve`, testes de integração, e infraestrutura operacional.

---

## 1. Migração Edge Functions (Batches B3, B6, B7, B8)

Cada função migrada segue o padrão: substituir `Deno.serve` pelo middleware correto, remover CORS/auth/client boilerplate, usar `ctx.*`, adicionar Zod.

### Batch B3 — Relatórios/Compliance → `serveTenant`

| Função | Linhas | Auth atual | Notas |
|--------|--------|------------|-------|
| `generate-compliance-report` | 726 | JWT manual | Complexa, modularizar |
| `generate-executive-report` | 335 | `assertInternalCaller` + `timingSafeEqual` | **Mantém** `Deno.serve` (interno) |
| `generate-security-report` | 618 | JWT manual | Complexa, modularizar |
| `generate-explainable-report` | ? | Verificar | Migrar se JWT |
| `generate-weekly-report` | ? | Verificar | Provavelmente cron (interno) |
| `calculate-risk-score` | 206 | JWT + `validateCallerTenant` | → `serveTenant` |
| `export-evidence-bundle` | 328 | JWT manual | → `serveTenant` |
| `verify-compliance-report` | ? | Verificar | → `serveTenant` |
| `scan-vulnerabilities` | 719 | **Já `serveTenant`** | ✅ Pronto |

**Estimativa:** ~6 funções a migrar, 2-3 permanecem internas.

### Batch B6 — Admin reads → `serveTenant`

| Função | Status | Notas |
|--------|--------|-------|
| `list-all-users-admin` | ✅ Já `serveTenant` | Pronto |
| `get-web-activity` | ✅ Já `serveTenant` | Pronto |
| `siem-export` | ✅ Já `serveTenant` | Pronto |
| `block-website` | `Deno.serve` + `X-Internal-Secret` | **Mantém** (é chamado internamente por automação) |
| `export-evidence-bundle` | `Deno.serve` + JWT | → `serveTenant` |

**Estimativa:** ~1-2 funções a migrar, maioria já pronta.

### Batch B7 — Public/Webhook

| Função | Status | Middleware |
|--------|--------|-----------|
| `submit-contact` | ✅ Já `servePublic` | Pronto |
| `health` | `Deno.serve` | → `servePublic` (simples, ~125 linhas) |
| `build-callback` | `Deno.serve` | Verificar auth (provavelmente `servePublic` ou HMAC) |
| `stripe-webhook` | `Deno.serve` | **Mantém** (precisa raw body para signature verification, similar a HMAC) |

**Estimativa:** ~1-2 funções a migrar.

### Batch B8 — Diversos

| Função | Status | Decisão |
|--------|--------|---------|
| `notification-dispatcher` | `Deno.serve` + `assertInternalCaller` | **Mantém** (interno/cron) |
| `send-notification` | `Deno.serve` + redirect | **Mantém** (deprecated redirect) |
| `send-email-notification` | `Deno.serve` | → `assertInternalCaller` pattern (chamado por dispatcher) |
| `send-telegram-notification` | `Deno.serve` | Idem |
| `send-whatsapp-notification` | `Deno.serve` | Idem |
| `translate-cve` | `Deno.serve` | → `serveTenant` |
| `sync-blocked-websites` | `Deno.serve` | → `serveTenant` |
| `sync-stripe-subscriptions` | `Deno.serve` | Verificar (provavelmente cron/interno) |
| `sync-cve-database` | `Deno.serve` | Verificar |
| `track-installation-event` | `Deno.serve` | → `serveAgent` ou `servePublic` |

**Funções restantes com `Deno.serve` que são cron/interno** (mantêm `Deno.serve` + `assertInternalCaller`): ~40-50 funções. Estas **não** precisam de migração pois já seguem o padrão correto para funções internas.

### Resumo real de migração

Após análise detalhada, o número de funções que realmente precisam migrar é **~15-20** (não 70), porque:
- ~63 funções já usam `serveTenant`/`serveAgent`/`servePublic`
- ~50 funções usam `assertInternalCaller` (cron/interno) — correto, não migrar
- ~12 funções usam HMAC com raw body — correto, não migrar
- ~3-5 funções são webhooks que precisam raw body (Stripe, etc.) — não migrar

**Ações por função migrada:**
1. Substituir `Deno.serve` pelo middleware correspondente
2. Remover CORS, `createClient()`, JWT manual
3. Usar `ctx.supabase`, `ctx.tenantId`, `ctx.userId`, `ctx.body`
4. Adicionar validação Zod
5. Funções >400 linhas: modularizar (`index.ts` + módulos)

---

## 2. Testes de Integração (30 funções críticas)

Criar `supabase/functions/__tests__/` com testes Deno para:

**Tier 1 — Agent lifecycle (HMAC):**
- `heartbeat`, `poll-jobs`, `submit-job-result`, `enroll-agent`

**Tier 2 — Telemetria:**
- `submit-system-metrics`, `submit-software-inventory`, `submit-web-activity`

**Tier 3 — Security/Admin:**
- `admin-create-user`, `create-job`, `generate-enrollment-key`
- `scan-vulnerabilities`, `block-website`

**Tier 4 — Auth:**
- `fido2-register`, `fido2-authenticate`, `change-password`

**Tier 5 — Automação:**
- `evaluate-automation-rules`, `check-production-health`

**Padrão de teste:**
- Mock do Supabase client
- Testar caminho feliz + erros de auth/validação
- Verificar tenant isolation

---

## 3. Infraestrutura (Fase 3)

### 3.1 Dead-Letter Queue
- Migração SQL: criar tabela `dead_letter_jobs`
- Lógica em `process-failed-jobs`: após N falhas → mover para DLQ
- Endpoint admin para reprocessamento via `dlq-action` (já existe parcialmente)

### 3.2 Rate Limiting
- Integrar `checkRateLimit` como opção no `serveTenant`
- Configurável por tenant via tabela existente

### 3.3 Cache KV
- Migração SQL: tabela `kv_cache` (key, value JSONB, expires_at)
- Helpers `cacheGet`/`cacheSet` em `_shared/kv-cache.ts`

### 3.4 Feature Flags
- Migração SQL: tabela `feature_flags` (name, enabled, rollout_pct, metadata)
- Helper `isFeatureEnabled(supabase, tenantId, flagName)`

### 3.5 Particionamento
- `agent_system_metrics` por mês
- `audit_logs` por mês
- Cron para criação automática de partições futuras

---

## Ordem de Execução

| Step | Tarefa | Estimativa |
|------|--------|------------|
| 1 | Migrar B3 (relatórios: `generate-compliance-report`, `generate-security-report`, `calculate-risk-score`, `export-evidence-bundle`) | 3h |
| 2 | Migrar B7-B8 restantes (`health`, `translate-cve`, `sync-blocked-websites`, `track-installation-event`, ~5 funções diversas) | 2h |
| 3 | Testes de integração Tier 1-2 (agent lifecycle + telemetria) | 3h |
| 4 | Testes de integração Tier 3-5 (admin + auth + automação) | 3h |
| 5 | Infraestrutura: DLQ + Rate limiting | 3h |
| 6 | Infraestrutura: Cache KV + Feature flags | 2h |
| 7 | Infraestrutura: Particionamento | 2h |
| **Total** | | **18h** |

## Critérios de Aceite

- Zero `Deno.serve` fora de HMAC, cron/interno e webhooks com raw body
- 30 funções críticas com testes de integração
- DLQ, rate limiting, cache e feature flags operacionais
- Particionamento ativo em tabelas de alta volumetria
- Build TypeScript limpo

