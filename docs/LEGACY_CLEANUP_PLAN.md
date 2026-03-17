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
