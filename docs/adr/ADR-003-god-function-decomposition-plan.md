# ADR-003: Plano de Decomposição de God Functions

**Status:** Em Execução  
**Data:** 2026-03-30  
**Meta:** Zero funções >400 linhas (backend) e zero componentes >500 linhas (frontend)

---

## Inventário Atual

### Backend — 26 Edge Functions >400 linhas

| # | Função | Linhas | Prioridade | Grupo |
|---|--------|--------|------------|-------|
| 1 | serve-installer | 881 | 🔴 Crítica | B1 |
| 2 | ai-system-analyzer | 783 | 🔴 Crítica | B1 |
| 3 | ai-full-audit | 779 | 🔴 Crítica | B1 |
| 4 | ai-action-executor | 719 | 🔴 Crítica | B1 |
| 5 | evaluate-playbook-triggers | 708 | 🔴 Crítica | B1 |
| 6 | auto-generate-enrollment | 658 | 🟠 Alta | B2 |
| 7 | scim-provisioning | 584 | 🟠 Alta | B2 |
| 8 | serve-agent-update | 570 | 🟠 Alta | B2 |
| 9 | submit-system-metrics | 535 | 🟠 Alta | B2 |
| 10 | track-installation-event | 527 | 🟠 Alta | B2 |
| 11 | send-scheduled-report | 513 | 🟠 Alta | B2 |
| 12 | enroll-agent | 496 | 🟡 Média | B3 |
| 13 | poll-jobs | 488 | 🟡 Média | B3 |
| 14 | cleanup-router/handlers | 479 | 🟡 Média | B3 |
| 15 | stripe-webhook | 473 | 🟡 Média | B3 |
| 16 | auto-execute-ai-actions | 469 | 🟡 Média | B3 |
| 17 | get-reinstall-by-name | 462 | 🟡 Média | B3 |
| 18 | register-agent-key | 457 | 🟡 Média | B3 |
| 19 | flush-event-buffer | 444 | 🟡 Média | B3 |
| 20 | maintenance-cron | 440 | 🟡 Média | B3 |
| 21 | sync-threat-feeds | 439 | 🟡 Média | B3 |
| 22 | generate-explainable-report | 431 | 🟢 Baixa | B4 |
| 23 | generate-security-report | 430 | 🟢 Baixa | B4 |
| 24 | check-action-effectiveness | 423 | 🟢 Baixa | B4 |
| 25 | threat-intelligence-lookup | 416 | 🟢 Baixa | B4 |
| 26 | system-maintenance | 405 | 🟢 Baixa | B4 |

### Frontend — 31 Componentes >500 linhas

| # | Componente | Linhas | Prioridade | Grupo |
|---|-----------|--------|------------|-------|
| 1 | SecurityPolicies | 693 | 🔴 Crítica | F1 |
| 2 | PitchDeck | 681 | 🔴 Crítica | F1 |
| 3 | AIInsights | 680 | 🔴 Crítica | F1 |
| 4 | VerificarLaudo | 671 | 🔴 Crítica | F1 |
| 5 | AIActionApproval | 669 | 🔴 Crítica | F1 |
| 6 | AppSidebar | 656 | 🔴 Crítica | F1 |
| 7 | SLODashboard | 653 | 🔴 Crítica | F1 |
| 8 | Login | 648 | 🔴 Crítica | F1 |
| 9 | AgentDetailsDrawer | 632 | 🟠 Alta | F2 |
| 10 | SystemHealth | 611 | 🟠 Alta | F2 |
| 11 | AgentGroups | 609 | 🟠 Alta | F2 |
| 12 | ClientOnboarding | 606 | 🟠 Alta | F2 |
| 13 | EnrollmentKeys | 591 | 🟠 Alta | F2 |
| 14 | ComplianceTimeline | 588 | 🟠 Alta | F2 |
| 15 | SecurityGraph | 582 | 🟠 Alta | F2 |
| 16 | SoftwareRiskDashboard | 570 | 🟠 Alta | F2 |
| 17 | StripeSetup | 562 | 🟡 Média | F3 |
| 18 | EvidenceBundlePage | 557 | 🟡 Média | F3 |
| 19 | SystemOperations | 556 | 🟡 Média | F3 |
| 20 | SecurityControlPlane | 553 | 🟡 Média | F3 |
| 21 | PlanUpgradeNew | 545 | 🟡 Média | F3 |
| 22 | RealTimeSecurityDashboard | 542 | 🟡 Média | F3 |
| 23 | ActionCenterDashboard | 538 | 🟡 Média | F3 |
| 24 | AgentHealthMonitor | 533 | 🟡 Média | F3 |
| 25 | NotificationChannels | 532 | 🟡 Média | F3 |
| 26 | ExecutiveDashboard | 509 | 🟢 Baixa | F4 |
| 27 | InstallationMetrics | 508 | 🟢 Baixa | F4 |
| 28 | AgentTest | 508 | 🟢 Baixa | F4 |
| 29 | AgentVersionMonitor | 505 | 🟢 Baixa | F4 |
| 30 | SecurityDashboard | 501 | 🟢 Baixa | F4 |

---

## Padrão de Decomposição

### Backend (Edge Functions)

```
supabase/functions/<nome>/
├── index.ts          # Orquestrador (~80-150 linhas)
├── types.ts          # Interfaces e schemas Zod
├── validation.ts     # Validação de input
├── handlers/         # Handlers por ação/rota
│   ├── handler-a.ts
│   └── handler-b.ts
└── helpers.ts        # Utilitários locais
```

**Regras:**
- `index.ts` mantém APENAS o middleware + dispatch
- Cada handler recebe contexto tipado e retorna Response/objeto
- Schemas Zod em `types.ts` (reexportados)
- Funções HMAC mantêm `Deno.serve` no index, lógica nos módulos

### Frontend (Componentes React)

```
src/pages/admin/<Nome>/
├── index.tsx         # Orquestrador (~100-200 linhas)
├── types.ts          # Interfaces do domínio
├── hooks/
│   ├── use<Nome>Data.ts
│   └── use<Nome>Actions.ts
├── components/
│   ├── <Nome>Header.tsx
│   ├── <Nome>Table.tsx
│   ├── <Nome>Filters.tsx
│   └── <Nome>Dialog.tsx
└── constants.ts      # Configurações estáticas
```

**Regras:**
- Nenhum subcomponente >250 linhas
- Estado centralizado no hook principal
- `index.tsx` compõe layout + subcomponentes
- sidebar.tsx (ui) não se decompõe — é lib

---

## Plano de Execução — 8 Lotes

### FASE 1: INÍCIO — Backend Crítico (Lote B1)
**5 funções, ~3.870 linhas**

| Ordem | Função | Estratégia |
|-------|--------|-----------|
| 1.1 | serve-installer (881L) | Extrair: validation.ts, installer-logic.ts, download-handler.ts |
| 1.2 | ai-system-analyzer (783L) | Extrair: analysis-engine.ts, report-builder.ts, types.ts |
| 1.3 | ai-full-audit (779L) | Extrair: audit-phases.ts, scoring.ts, recommendations.ts |
| 1.4 | ai-action-executor (719L) | Extrair: action-handlers/, validation.ts, execution.ts |
| 1.5 | evaluate-playbook-triggers (708L) | Extrair: trigger-evaluators.ts, condition-engine.ts |

**Validação B1:**
- [ ] Cada index.ts ≤ 150 linhas
- [ ] `tsc --noEmit` limpo
- [ ] Teste manual via curl das rotas principais
- [ ] Zero regressão nos testes existentes

### FASE 2: Backend Alto (Lote B2)
**6 funções, ~3.387 linhas**

| Ordem | Função | Estratégia |
|-------|--------|-----------|
| 2.1 | auto-generate-enrollment (658L) | Extrair: enrollment-logic.ts, key-generator.ts |
| 2.2 | scim-provisioning (584L) | Extrair: scim-handlers/ (users, groups), schema.ts |
| 2.3 | serve-agent-update (570L) | Extrair: update-logic.ts, version-check.ts |
| 2.4 | submit-system-metrics (535L) | Extrair: metrics-parser.ts, storage.ts |
| 2.5 | track-installation-event (527L) | Extrair: event-processor.ts, telemetry.ts |
| 2.6 | send-scheduled-report (513L) | Extrair: report-builder.ts, email-sender.ts |

**Validação B2:** Mesmos critérios de B1

### FASE 3: Backend Médio (Lote B3)
**10 funções, ~4.652 linhas**

| Ordem | Função | Estratégia |
|-------|--------|-----------|
| 3.1-10 | enroll-agent, poll-jobs, cleanup-router, stripe-webhook, auto-execute-ai-actions, get-reinstall-by-name, register-agent-key, flush-event-buffer, maintenance-cron, sync-threat-feeds | Extrair handlers, validation, helpers |

**Validação B3:** Mesmos critérios + auditoria de imports

### FASE 4: Backend Baixo (Lote B4)
**5 funções, ~2.105 linhas**

| Ordem | Função |
|-------|--------|
| 4.1-5 | generate-explainable-report, generate-security-report, check-action-effectiveness, threat-intelligence-lookup, system-maintenance |

**Validação B4:** Build limpo + contagem final = 0 funções >400L

---

### FASE 5: Frontend Crítico (Lote F1)
**8 componentes, ~5.350 linhas**

| Ordem | Componente | Estratégia |
|-------|-----------|-----------|
| 5.1 | SecurityPolicies (693L) | Diretório com PolicyTable, PolicyEditor, usePolicies |
| 5.2 | PitchDeck (681L) | Slides como subcomponentes, usePitchData |
| 5.3 | AIInsights (680L) | InsightCards, InsightChart, useAIInsights |
| 5.4 | VerificarLaudo (671L) | SearchForm, ResultView, useVerification |
| 5.5 | AIActionApproval (669L) | ApprovalTable, ApprovalDialog, useApprovals |
| 5.6 | AppSidebar (656L) | SidebarNav, SidebarFooter, menu-items.ts |
| 5.7 | SLODashboard (653L) | SLOCards, SLOChart, useSLOData |
| 5.8 | Login (648L) | LoginForm, SocialAuth, useAuth |

**Validação F1:**
- [ ] Cada arquivo ≤ 250 linhas
- [ ] Build Vite limpo (0 erros)
- [ ] Navegação funcional (todas as rotas)
- [ ] Layout visual intacto (sem regressão)

### FASE 6: Frontend Alto (Lote F2)
**8 componentes, ~4.789 linhas**

| Ordem | Componente |
|-------|-----------|
| 6.1-8 | AgentDetailsDrawer, SystemHealth, AgentGroups, ClientOnboarding, EnrollmentKeys, ComplianceTimeline, SecurityGraph, SoftwareRiskDashboard |

**Validação F2:** Mesmos critérios de F1

### FASE 7: Frontend Médio (Lote F3)
**9 componentes, ~4.926 linhas**

| Ordem | Componente |
|-------|-----------|
| 7.1-9 | StripeSetup, EvidenceBundlePage, SystemOperations, SecurityControlPlane, PlanUpgradeNew, RealTimeSecurityDashboard, ActionCenterDashboard, AgentHealthMonitor, NotificationChannels |

**Validação F3:** Mesmos critérios + zero @ts-ignore

### FASE 8: FIM — Frontend Baixo (Lote F4)
**5 componentes, ~2.531 linhas**

| Ordem | Componente |
|-------|-----------|
| 8.1-5 | ExecutiveDashboard, InstallationMetrics, AgentTest, AgentVersionMonitor, SecurityDashboard |

**Validação F4:** Build limpo + contagem final = 0 componentes >500L

---

## Critérios de Conclusão (Definition of Done)

### Por Lote
1. ✅ Nenhum arquivo ultrapassa o limite (400L backend / 250L frontend)
2. ✅ `tsc --noEmit` com 0 erros
3. ✅ Build Vite com 0 erros
4. ✅ Testes existentes passando (vitest)
5. ✅ Zero `@ts-ignore` adicionado
6. ✅ Contrato de API preservado (sem breaking changes)

### Validação Final (Pós-Fase 8)
1. ✅ `find supabase/functions -name "*.ts" | xargs wc -l | awk '$1 > 400'` → vazio
2. ✅ `find src -name "*.tsx" | xargs wc -l | awk '$1 > 500'` → vazio
3. ✅ Build completo limpo
4. ✅ Todas as rotas navegáveis
5. ✅ ADR-003 marcado como "Concluído"

---

## Estimativa de Esforço

| Fase | Itens | Linhas Afetadas | Complexidade |
|------|-------|----------------|-------------|
| B1 | 5 funções | ~3.870 | Alta |
| B2 | 6 funções | ~3.387 | Alta |
| B3 | 10 funções | ~4.652 | Média |
| B4 | 5 funções | ~2.105 | Baixa |
| F1 | 8 componentes | ~5.350 | Alta |
| F2 | 8 componentes | ~4.789 | Média |
| F3 | 9 componentes | ~4.926 | Média |
| F4 | 5 componentes | ~2.531 | Baixa |
| **Total** | **56 itens** | **~31.610** | — |

## Notas

- `sidebar.tsx` (637L) é componente de UI library (shadcn) — NÃO decompor
- Funções HMAC mantêm `Deno.serve` no index
- Ordem de execução: Backend primeiro (B1→B4), depois Frontend (F1→F4)
- Cada fase é atômica: só avança após validação completa
