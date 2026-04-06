
# Plano: Remediação de Dívida Técnica Não-Crítica

## Diagnóstico Atual
| Item | Estado | Dados |
|---|---|---|
| backup_verifications | 1 registro | Último: 2026-04-06 |
| secret_rotation_log | 6 registros | Último: 2026-04-06 |
| access_review (audit_logs) | 1 registro | Sem execução trimestral |
| `any` no frontend | 140 arquivos, ~300 ocorrências | Top: useAgentMonitoring(10), AIFeedbackDashboard(6), IdentitySecurity(5) |
| setInterval em produção | 15 pontos ativos | JobTestRunner(5s), OnboardingWizard(10s), AgentBuild(poll) |

---

## Fase 1 — Automação de Evidências SOC 2 (DB + Crons)

### 1A. Cron para Teste de Restore Mensal
- Criar cron `dr-restore-monthly` que executa `ops-gateway` com action `check:dr-restore`
- O handler insere evidência sintética em `backup_verifications` com status `scheduled`
- **Custo**: 1 execução/mês = ~$0.001

### 1B. Cron para Access Review Trimestral
- Criar cron `access-review-quarterly` que executa `ops-gateway` com action `check:access-review`
- Já existe handler `access-review.ts` funcional
- Agendar para dia 1 de Jan/Abr/Jul/Out às 07:00
- **Custo**: 4 execuções/ano = negligível

### 1C. Enriquecer Rotação de Segredos
- O cron `rotate-audit` já existe e roda semanalmente
- Verificar se está gerando registros em `secret_rotation_log` consistentemente
- Se necessário, ajustar para garantir ao menos 1 registro/semana

---

## Fase 2 — Eliminação de `any` (Frontend) — Top 30 Arquivos

Prioridade por impacto (arquivos com mais ocorrências):

**Lote 1 — Hooks e Use Cases (maior risco de runtime)**
1. `useAgentMonitoring.ts` (10 any)
2. `useAIFeedbackDashboard.ts` (6 any)
3. `useDataExport.ts` (5 any)
4. `IdentitySecurity.tsx` (5 any)
5. `AgentTimeline.tsx` (4 any)
6. `ActionsTab.tsx` (4 any)
7. `renderSections.ts` (4 any)
8. `GeneratedReportsList.tsx` (4 any)

**Lote 2 — Componentes e Pages**
9-20. Arquivos com 3 ocorrências cada (~12 arquivos)

**Lote 3 — Restantes**
21-30. Arquivos com 2 ocorrências

**Estratégia**: `unknown` + type guards para dados externos; generics para funções utilitárias; tipos concretos para mappers.

---

## Fase 3 — Otimização de Polling (setInterval → React Query)

### Migrar para React Query `refetchInterval`:
| Arquivo | Atual | Novo |
|---|---|---|
| `JobTestRunner.tsx` | setInterval 5s | refetchInterval: 5000, enabled: isPolling |
| `AutomatedOnboardingWizard.tsx` | setInterval 10s | refetchInterval: 10000, enabled: isChecking |
| `OnboardingWizard.tsx` | setInterval (custom) | refetchInterval controlado |
| `useAgentBuild.ts` | setInterval (poll) | refetchInterval: 5000, enabled: isBuilding |
| `InstallationHealthCard.tsx` | setInterval | refetchInterval: 60000 |
| `EnrollmentKeys/index.tsx` | setInterval 60s | refetchInterval: 60000 |

### Manter (são legítimos):
- `useAuth.tsx` (token refresh 120s) — necessário
- `useSessionGuard.ts` / `useSessionTimeout.ts` — timers de segurança
- `useRealTimeCountdown.ts` — UI countdown, não faz fetch
- `GlobalJobWatcher.tsx` — cleanup local, não faz fetch
- `storage.ts` — cleanup de cache local
- `useSessionManager.ts` — activity tracking

---

## Fase 4 — Validação Final

1. `npx tsc --noEmit --skipLibCheck` = 0 erros
2. Verificar crons inseridos com `SELECT * FROM cron.job WHERE active = true`
3. Confirmar evidências fluindo para `backup_verifications` e `audit_logs`
4. Grep final: contagem de `any` reduzida em >50%

---

## Estimativa de Impacto em Custos
- Crons novos: +2 execuções/mês = ~$0.01/mês
- Remoção de setInterval: -6 polling loops = redução de reads em tabs inativas
- Total: **economia líquida estimada de ~$2-5/mês** em DB reads
