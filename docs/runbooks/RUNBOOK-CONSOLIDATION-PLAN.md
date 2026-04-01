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

## 3. Migração de Callers (Concluída - Fase 6)

Todos os callers do frontend foram migrados para usar os gateways diretamente:

| Caller | Roteador Antigo | Gateway Novo | Status |
|--------|----------------|--------------|--------|
| `Reports/index.tsx` | report-router (security) | ops-gateway (report:security) | ✅ MIGRADO |
| `TestComplianceGenerator.tsx` | report-router (compliance) | ops-gateway (report:compliance) | ✅ MIGRADO |
| `useComplianceReport.ts` | report-router (compliance) | ops-gateway (report:compliance) | ✅ MIGRADO |
| `useRiskDelta.ts` | report-router (executive) | ops-gateway (report:executive) | ✅ MIGRADO |
| `CohortAnalysis.tsx` | billing-router (cohort-analysis) | api-gateway (billing:cohort-analysis) | ✅ MIGRADO |
| `logger.ts` | sync-router (log-domain-event) | ops-gateway (sync:log-domain-event) | ✅ MIGRADO |
| `PersistentDomainEventPublisher.ts` | sync-router (log-domain-event) | ops-gateway (sync:log-domain-event) | ✅ MIGRADO |
| `Invites.tsx` | ops-router (notify:invite) | ops-gateway (notify:invite) | ✅ MIGRADO |

### Callers mantidos no ops-router (notify:* — backward compat via meta-router)

| Caller | Action | Nota |
|--------|--------|------|
| `Signup.tsx` | notify:welcome | ops-router → ops-gateway (funcional) |
| `AutomationRulesPanel.tsx` | automation:evaluate | ops-router → ops-gateway (funcional) |
| `AlertsTab.tsx` | notify:dispatch | ops-router → ops-gateway (funcional) |
| `useNotificationSettings.ts` | notify:dispatch / notify:scheduled-report | ops-router → ops-gateway (funcional) |
| `TenantInvites.tsx` | notify:invite | ops-router → ops-gateway (funcional) |

---

## 4. Proxima Fase: Remocao dos Roteadores Deprecados

Os 9 roteadores deprecados agora podem ser removidos, pois todos os callers diretos foram migrados:

1. ~~Migrar callers frontend para usar gateways diretamente~~ ✅
2. Migrar cron jobs para usar gateways (verificar pg_cron)
3. Remover os 9 roteadores deprecados (-9 funcoes)

---

## 5. Metricas

| Metrica | Antes (Fase 4) | Depois (Fase 5) | Pos-Migracao (Fase 6) | Meta (pos-remocao) |
|---------|----------------|-----------------|----------------------|-------------------|
| Total Edge Functions | 232 | 233 | 233 | 224 (-9 deprecated) |
| Roteadores ativos | 15 | 2 gw + 5 mantidos | 2 gw + 5 mantidos | 2 gw + 5 mantidos |
| Callers diretos a routers deprecated | 7 | 7 | 0 | 0 |
| Hops HTTP (via ops-router) | 3 | 2 | 2 | 2 |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Engineering | Versao inicial |
| 2.0 | 2026-04-01 | CyberShield Engineering | Fase 5: 2 super-gateways, 9 routers deprecated, security-cleanup-cron removido |
| 3.0 | 2026-04-01 | CyberShield Engineering | Fase 6: Migracao de todos os callers frontend para gateways diretos |
