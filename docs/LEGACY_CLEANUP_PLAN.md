# Plano de Remoção de Código Legado

## Status: Em Execução
**Data**: 2026-03-17

---

## P0 — Funções de Teste/Risco (✅ CONCLUÍDO)

| Função | Ação | Data |
|--------|------|------|
| `chaos-test` | ✅ Removida | 2026-03-17 |
| `nuke-reinstall-mit` | ✅ Removida | 2026-03-17 |
| `deploy-v5014-test` | ✅ Removida | 2026-03-17 |
| `test-internal-auth` | ✅ Removida | 2026-03-17 |

**Mantidas** (funcionalidades admin legítimas):
- `test-stripe-integration` — Usada em Settings.tsx
- `test-virustotal-integration` — Usada em Settings.tsx  
- `test-webhook` — Usada em Settings.tsx
- `cleanup-test-data` — Usada em AgentTest.tsx

---

## P1 — Type Safety em Views (✅ CONCLUÍDO)

Removidos `as any` desnecessários de views já tipadas:
- `v_incident_groups_with_slo` → tipado
- `incident_slo_state` → tipado
- `blast_radius_policies` → tipado (tabela)
- `forensic_snapshots` → tipado (tabela)
- `v_normalized_events` → tipado

**Mantidos com `as any`** (TS2589 em views profundamente aninhadas):
- `v_incident_groups` — Tipo recursivo demais para inferência TS
- `insight_feedback_quality` — Não presente nos tipos gerados

---

## P1 — Consolidação de Notificações (📋 PLANEJADO)

**Target**: `notification-dispatcher` já existe como destino.

| Função Legada | Callers | Status |
|---------------|---------|--------|
| `send-alert-email` | 5 (security-log, monitor-agent-health, alert-high-failure-rate, test-internal-auth) | 📋 Migrar |
| `send-system-alert` | 4 (check-tenant-quotas, auto-quarantine, monitor-thresholds, monitor-slow-operations) | 📋 Migrar |
| `send-health-alert` | 2 (monitor-agent-health) | 📋 Migrar |
| `send-brute-force-alert` | 1 (record-failed-login) | 📋 Migrar |
| `send-security-notification` | 1 (generate-weekly-report) | 📋 Migrar |
| `send-report-notification` | 0 frontend refs | 📋 Migrar |

**Plano**: Converter cada uma em proxy para `notification-dispatcher` em sprint dedicado.

---

## P2 — Patches Obsoletos de Agente (✅ CONCLUÍDO)

| Função | Ação | Data |
|--------|------|------|
| `fix-agent-script-v413` | ✅ Removida | 2026-03-17 |
| `fix-agent-script-v414` | ✅ Removida | 2026-03-17 |
| `patch-agent-v505` | ✅ Removida | 2026-03-17 |
| `patch-agent-v507` | ✅ Removida | 2026-03-17 |

---

## P2 — Sunset do Protocolo v1 (ack-job)

| Item | Status |
|------|--------|
| Deprecation warning no endpoint | ✅ Ativo |
| Sunset date definida | ✅ **2026-06-01** |
| Sunset header no response | ✅ Adicionado |
| `jobs_normalized` view | Remover após sunset |
| Migração de agentes v1 | Monitorar via `/admin/jobs-v3-migration` |

**Critério de remoção**: >95% dos jobs usando v3 por 2 semanas consecutivas.

---

## Métricas

| Categoria | Antes | Depois | Redução |
|-----------|-------|--------|---------|
| Edge Functions perigosas | 4 | 0 | -4 |
| Patches obsoletos | 4 | 0 | -4 |
| `as any` em views tipadas | 8 | 2 | -6 |
| Superfície de ataque | ~270 funções | ~262 funções | -8 |

---

## Auditoria de Superfícies de Ataque (2026-03-17)

### Vulnerabilidades Corrigidas

| # | Função | Severidade | Vulnerabilidade | Correção |
|---|--------|-----------|----------------|---------|
| SA-001 | `clear-failed-logins` | **CRÍTICA** | Sem autenticação — qualquer pessoa podia limpar proteção brute-force | Adicionado JWT auth obrigatório |
| SA-002 | `cleanup-test-data` | **CRÍTICA** | Sem filtro `tenant_id` — admin de tenant A podia apagar dados de tenant B | Escopo restrito a `super_admin` + filtro por `tenant_id` do caller |
| SA-003 | `run-rls-tests` | **ALTA** | Header `x-cron-source` spoofável — bypass de autenticação | Substituído por validação `service_role` / `X-Internal-Secret` |
| SA-004 | `test-virustotal-integration` | **MÉDIA** | Bloqueava `super_admin` (verificava apenas `admin`) | Adicionado `super_admin` à lista de roles permitidos |
| SA-005 | `test-webhook` | **MÉDIA** | Idem SA-004 | Idem |
| SA-006 | `admin-create-user` | **MÉDIA** | Import `serve` de `deno.land/std` (risco de bundling/500) | Migrado para `Deno.serve()` nativo |
| SA-007 | `approve-via-token` | **MÉDIA** | Idem SA-006 | Idem |

### Superfícies Auditadas e Aprovadas

| Categoria | Funções Analisadas | Status |
|-----------|-------------------|--------|
| Admin privilegiadas | `admin-create-user`, `list-all-users-admin`, `update-user-role`, `remove-member` | ✅ Auth + tenant isolation |
| Agent-facing (X-Agent-Token) | `heartbeat`, `poll-jobs`, `submit-job-result`, `enroll-agent` | ✅ Token hash auth |
| Públicas (sem auth) | `submit-contact`, `health` | ✅ Rate-limited + validação |
| Token-based | `approve-via-token` | ✅ Single-use + rate-limited |
| Cron/Internal | `cleanup-*`, `monitor-*`, `cron-sentinel` | ✅ `assertInternalCaller` |
| Upload/Sync | `upload-agent-script`, `sync-*` | ✅ `super_admin` required |
| Destrutivas | `force-reinstall-fleet`, `cleanup-test-data` | ✅ Admin + tenant scoped |
