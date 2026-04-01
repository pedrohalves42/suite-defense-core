
# Plano: Cobertura de Testes 6% → 80%

## Estado Atual
- **58 arquivos de teste**, **586 testes passando**, **1196 arquivos fonte**
- Cobertura estimada: ~6% (muitos arquivos sem nenhum teste)
- Timeout no thread pool do Vitest (precisa fix na config)

## Correção Imediata: Vitest Config
O pool de threads está dando timeout. Trocar para `forks` e ajustar timeouts.

---

## Fase 1: Fundação & Pure Functions (6% → 25%) — ~120 testes novos
**Custo-benefício: MÁXIMO** (funções puras, sem mocks complexos)

### 1.1 Bibliotecas utilitárias (`src/lib/`)
Testar todas as funções puras sem dependência de React/Supabase:
- `date-utils.ts`, `sanitize.ts`, `csv-export.ts`, `os-utils.ts`
- `agent-state-machine.ts`, `agent-utils.ts`, `status-utils.ts`
- `circuit-breaker.ts`, `health-rules.ts`, `job-utils.ts`
- `alert-translator.ts`, `leigo-translator.ts`, `ui-dictionary.ts`
- `badges.ts`, `severityColors.ts`, `friendly-status.ts`
- `subscriptionLimits.ts`, `education-mapping.ts`
- `compliance/crypto.ts`, `compliance/ecdsa.ts`
- `errors.ts`, `logger.ts`, `storage.ts`

### 1.2 Domain Layer (`src/domain/`)
Já tem 11 test files — completar cobertura de branches não testados.

### 1.3 Application Layer (`src/application/`)
Já tem 4 test files — completar edge cases.

---

## Fase 2: Hooks Críticos (25% → 40%) — ~100 testes novos
**Custo-benefício: ALTO** (lógica de negócio real)

### 2.1 Hooks de autenticação e sessão
- `useAuth.tsx`, `useSessionManager.ts`, `useSessionGuard.ts`
- `useSessionTimeout.ts`, `useMFA.tsx`, `useMFAEnforcement.tsx`
- `useStepUpAuth.tsx`, `useWebAuthn.tsx`

### 2.2 Hooks de dados core
- `useRiskScore.ts`, `useRiskDelta.ts`, `useRiskDebt.ts`
- `useActionCenter.ts`, `usePlaybooks.ts`, `useDetectionRules.ts`
- `useNotifications.ts`, `useSmartNotifications.ts`
- `useJobsHealth.ts`, `useJobsSLO.ts`, `useScheduledJobsHealth.ts`
- `useVulnFindings.tsx`, `useSoftwareInventory.tsx`

### 2.3 Hooks de tenant/admin
- `useActiveTenant.tsx`, `useTenantFeatures.tsx`
- `useRolePermissions.tsx`, `useUserRole.tsx`
- `useSubscription.tsx`, `useUpgradeFlow.tsx`

---

## Fase 3: Componentes UI Core (40% → 55%) — ~100 testes novos
**Custo-benefício: MÉDIO** (mais boilerplate, mas garante UX)

### 3.1 Componentes de layout e navegação
- `AdminLayout`, `Sidebar`, `NavigationMenu`
- Componentes de `auth/` (LoginForm, SignupForm, MFASetup)

### 3.2 Componentes de dashboard
- Widgets de métricas, gráficos, cards de resumo
- Componentes de `action-center/` (já tem 3, expandir)

### 3.3 Componentes de agente
- Lista de agentes, detalhes, timeline
- Cards de saúde, métricas, snapshots

---

## Fase 4: Edge Functions Shared (55% → 70%) — ~80 testes novos
**Custo-benefício: ALTO** (código backend crítico)

### 4.1 Módulos compartilhados (via Vitest com edge-mocks)
- `_shared/hmac.ts` (validação HMAC)
- `_shared/serve-tenant.ts` (middleware de autenticação)
- `_shared/cors.ts`, `_shared/logger.ts`
- `_shared/ai-multi-provider.ts` (circuit breaker, scoring)

### 4.2 Handlers de roteadores
- `submit-router/handlers/*` (7 handlers)
- `ai-router/handlers/*`
- Validação de schemas Zod de cada handler

### 4.3 Testes de integração Deno
- Expandir `supabase/functions/__tests__/` para cobrir todos os roteadores

---

## Fase 5: Páginas e E2E (70% → 80%) — ~60 testes novos
**Custo-benefício: MÉDIO** (garante fluxos completos)

### 5.1 Páginas principais
- Login, Signup, Dashboard, AgentManagement
- Landing, Pricing, Settings

### 5.2 Fluxos E2E unitários
- Login → Dashboard → ver agentes
- Criar job → ver resultado
- Ações do action center

---

## Quality Gates (CI)
1. Subir thresholds progressivamente no `vitest.config.ts`:
   - Fase 1 completa: 25%
   - Fase 2 completa: 40%
   - Fase 3 completa: 55%
   - Fase 4 completa: 70%
   - Fase 5 completa: 80%
2. CI bloqueia merge se cobertura cair

## Ordem de Execução Proposta
Começar pela **Fase 1.1** (pure functions em `src/lib/`) por ser o maior ROI com menor esforço.

## Estimativa
- ~460 testes novos no total
- Cada fase pode ser implementada incrementalmente
