
# Plano de Melhorias — CyberShield (Atualizado 12/03/2026)

## ✅ Concluído (Sprint 1 — 12/03/2026)

### Refatoração do ServerDashboard (1787 → ~130 linhas)
| Componente | Arquivo | Responsabilidade |
|---|---|---|
| `useDashboardData` | `src/hooks/useDashboardData.ts` | Hook de dados: fetch, realtime, polling |
| `useDashboardMetrics` | `src/hooks/useDashboardMetrics.ts` | Hook de métricas derivadas |
| `SystemStatusBanner` | `src/components/dashboard/SystemStatusBanner.tsx` | Banner de estado global |
| `MetricCards` | `src/components/dashboard/MetricCards.tsx` | 4 cards de KPIs principais |
| `AdminMetricCards` | `src/components/dashboard/AdminMetricCards.tsx` | Cards admin (integridade, waste, credenciais) |
| `MultiTenantOverview` | `src/components/dashboard/MultiTenantOverview.tsx` | Visão multi-empresa (super_admin) |
| `DashboardCharts` | `src/components/dashboard/DashboardCharts.tsx` | 4 gráficos (tendência, vírus, tipos, agentes) |
| `SecurityTimeline` | `src/components/dashboard/SecurityTimeline.tsx` | Timeline de eventos humanizada |
| `DashboardTabs` | `src/components/dashboard/DashboardTabs.tsx` | Tabs com lazy loading |
| `DashboardEmptyState` | `src/components/dashboard/DashboardEmptyState.tsx` | Empty state com onboarding |
| Tabs: `AgentsTab`, `JobsTab`, `ReportsTab`, `EvidenceTab`, `SecurityTab` | `src/components/dashboard/tabs/` | Conteúdo de cada tab |

### Otimizações aplicadas
- ✅ Lazy loading (React.lazy) nas 5 tabs do dashboard
- ✅ useMemo em todas as métricas derivadas
- ✅ Empty states consistentes em todos os componentes
- ✅ Landing page: removidos 7 imports não utilizados

## ⏳ Pendente (Próximos Sprints)

| # | Área | Prioridade | Status |
|---|------|-----------|--------|
| 1 | Skeleton loaders durante carregamento | ALTO | TODO |
| 2 | Mobile audit (tabelas responsivas) | ALTO | TODO |
| 3 | i18n cobertura EN | MÉDIO | TODO |
| 4 | Relatório executivo PDF | MÉDIO | TODO |
| 5 | Notificações push PWA | MÉDIO | TODO |
| 6 | Testes unitários (hooks + components) | BAIXO | TODO |
| 7 | APM frontend (Web Vitals) | BAIXO | TODO |
| 8 | Particionamento de tabelas grandes | BAIXO | TODO |
