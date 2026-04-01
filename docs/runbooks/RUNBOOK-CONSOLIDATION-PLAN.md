# Plano de Consolidacao de Roteadores

| Campo | Valor |
|-------|-------|
| **Codigo** | CONS-001 |
| **Versao** | 2.0 |
| **Status** | Em Execucao |
| **Data** | 2026-04-01 |
| **Prioridade** | Media |

---

## 1. Estado Atual (pos-Fase 5)

### 1.1 Arquitetura de Gateways

| Gateway | Namespaces | Funcao |
|---------|-----------|--------|
| `api-gateway` | admin, billing, security, build, agent | Plataforma/Admin (~101 actions) |
| `ops-gateway` | check, sync, playbook, report, cleanup, notify | Operacoes/Monitoring (~84 actions) |
| `ops-router` | Meta-router que delega para os 2 gateways | Backward compat |

### 1.2 Roteadores Deprecados (proxies finos para gateways)

| Roteador | Gateway Destino | Status |
|----------|----------------|--------|
| `admin-router` | api-gateway (admin:*) | DEPRECATED |
| `billing-router` | api-gateway (billing:*) | DEPRECATED |
| `security-router` | api-gateway (security:*) | DEPRECATED |
| `build-router` | api-gateway (build:*) | DEPRECATED |
| `agent-mgmt-router` | api-gateway (agent:*) | DEPRECATED |
| `check-router` | ops-gateway (check:*) | DEPRECATED |
| `sync-router` | ops-gateway (sync:*) | DEPRECATED |
| `playbook-router` | ops-gateway (playbook:*) | DEPRECATED |
| `report-router` | ops-gateway (report:*) | DEPRECATED |

### 1.3 Roteadores Mantidos (middleware diferente)

| Roteador | Middleware | Motivo |
|----------|-----------|--------|
| `cleanup-router` | Deno.serve raw | Handlers complexos com modulos locais |
| `notification-router` | Deno.serve raw | 6 handlers diretos com modulos locais |
| `ai-router` | serveTenant | Middleware diferente dos gateways |
| `submit-router` | serveAgent | Middleware agent-facing |
| `collect-router` | serveAgent | Middleware agent-facing |

### 1.4 Funcoes Eliminadas

| Funcao | Motivo |
|--------|--------|
| `security-cleanup-cron` | Proxy puro para cleanup-router, logica inlinada no api-gateway |

---

## 2. Handlers Inlinados nos Gateways

### api-gateway/handlers/billing.ts
- `handleCohortAnalysis` (ex billing-router)
- `handleResetDailyQuotas` (ex billing-router)
- `handleCheckTenantQuotas` (ex billing-router)
- `handleCheckTrialExpiration` (ex billing-router)
- `handleSecurityCleanup` (ex security-router)

### ops-gateway/handlers/check.ts
- `handleCheckTaskSlaBreach` (ex check-router)
- `handleEvaluateJobSlo` (ex check-router)
- `handleCheckInstallationHealth` (ex check-router)
- `handleCheckProductionHealth` (ex check-router)
- `handleDetectBlockedAttempts` (ex check-router)

### ops-gateway/handlers/sync.ts
- `handleResetDailyQuotas` (ex sync-router)
- `handleLogDomainEvent` (ex sync-router)
- `handleHmacCleanupScheduled` (ex sync-router)
- `handleProcessTenantSuspensions` (ex sync-router)
- `handleScheduledComplianceRefresh` (ex sync-router)
- `handleFlushEventBuffer` (ex sync-router)

### ops-gateway/handlers/playbook.ts
- `handleAutoTriageInsights` (ex playbook-router)

---

## 3. Proxima Fase: Remocao dos Roteadores Deprecados

Apos 30 dias sem chamadas diretas aos roteadores deprecados:

1. Migrar callers frontend para usar gateways diretamente
2. Migrar cron jobs para usar gateways
3. Remover os 9 roteadores deprecados (-9 funcoes)

### Callers a Atualizar

| Caller | Roteador Atual | Gateway Novo |
|--------|---------------|--------------|
| `useComplianceReport.ts` | report-router | ops-gateway (report:*) |
| `AutomationRulesPanel.tsx` | ops-router | ops-router (sem mudanca) |
| `useJobCleanup.ts` | cleanup-router | cleanup-router (mantido) |
| `useRiskDelta.ts` | report-router | ops-gateway (report:*) |
| `PersistentDomainEventPublisher.ts` | sync-router | ops-gateway (sync:*) |
| `CohortAnalysis.tsx` | billing-router | api-gateway (billing:*) |

---

## 4. Metricas

| Metrica | Antes (Fase 4) | Depois (Fase 5) | Meta (pos-remocao) |
|---------|----------------|-----------------|-------------------|
| Total Edge Functions | 232 | 233 (+2 gateways, -1 proxy) | 224 (-9 deprecated) |
| Roteadores ativos | 15 | 2 gateways + 5 mantidos | 2 gateways + 5 mantidos |
| Handlers inlinados | 17 | 17 (migrados para gateways) | 17 |
| Hops HTTP (via ops-router) | 3 | 2 | 2 |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Engineering | Versao inicial |
| 2.0 | 2026-04-01 | CyberShield Engineering | Fase 5: 2 super-gateways, 9 routers deprecated, security-cleanup-cron removido |
