
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
| `SecurityTimeline` | `src/components/dashboard/SecurityTimeline.tsx` | Timeline humanizada de eventos |
| `DashboardTabs` | `src/components/dashboard/DashboardTabs.tsx` | Tabs com lazy loading |
| `DashboardEmptyState` | `src/components/dashboard/DashboardEmptyState.tsx` | Empty state com onboarding |
| Tabs: `AgentsTab`, `JobsTab`, `ReportsTab`, `EvidenceTab`, `SecurityTab` | `src/components/dashboard/tabs/` | Conteúdo de cada tab |

### Otimizações aplicadas
- ✅ Lazy loading (React.lazy) nas 5 tabs do dashboard
- ✅ useMemo em todas as métricas derivadas
- ✅ Empty states consistentes em todos os componentes
- ✅ Landing page: removidos 7 imports não utilizados

## ✅ Concluído (Sprint 2 — 12/03/2026)

### Skeleton Loaders, Mobile, PDF, Testes
- ✅ Skeleton Loaders animados em todos os componentes do dashboard
- ✅ Dashboard responsivo mobile (grids, fontes, padding adaptativos)
- ✅ Relatório PDF Executivo com KPIs, agentes, recomendações automáticas
- ✅ 10 testes unitários `useDashboardMetrics.test.ts`

## ✅ Concluído (Sprint 3 — 12/03/2026)

### Performance & Segurança
- ✅ `useRateLimiter` hook — rate limiting frontend para mutations (sliding window)
- ✅ `DashboardErrorBoundary` — isolamento de falhas por seção
- ✅ `React.memo` em AgentsTab, JobsTab, ReportsTab
- ✅ `useSessionGuard` — detecção de sessão expirada + redirect graceful
- ✅ Comparação temporal 24h nos KPIs (TrendIndicator ↑↓)

## ✅ Concluído (Sprint 4 — 12/03/2026)

### Usabilidade & Funcionalidades
- ✅ `CSVExportButton` — botão de exportação CSV reutilizável
- ✅ CSV export em AgentsTab, JobsTab, ReportsTab
- ✅ `Breadcrumbs` — navegação contextual em todas as páginas admin
- ✅ Busca e filtros em todas as tabs do dashboard

## ✅ Concluído (Sprint 5 — 12/03/2026)

### Qualidade, i18n & Acessibilidade
- ✅ i18n EN completo — adicionadas 50+ chaves `dashboardPanel.*` em en.json e pt-BR.json
- ✅ ARIA labels em MetricCards (`role="button"`, `aria-label`, `tabIndex`, `onKeyDown`)
- ✅ ARIA `role="region"` + `aria-label` em gráficos e métricas
- ✅ `aria-label` na navegação Breadcrumbs
- ✅ `aria-current="page"` no breadcrumb ativo
- ✅ Keyboard navigation (Enter/Space) nos cards de métricas
- ✅ 10 testes unitários passando

## ✅ Concluído (Sprint 6 — 12/03/2026)

### Performance Avançada & React Query
- ✅ `useDashboardQueries` — migração completa de useState+setInterval para React Query
  - Cache automático, deduplicação, stale-while-revalidate
  - `refetchInterval: 10s` para dados críticos, `30s` para dados secundários
  - Realtime channels invalidam cache ao invés de refetch completo
- ✅ `VirtualizedList` — componente genérico com react-window para listas 50+ itens
- ✅ `useWebVitals` hook — APM frontend monitorando LCP, FID, CLS, TTFB, FCP
- ✅ `WebVitalsCard` — card visual com score de performance no dashboard admin

## ✅ Concluído (Sprint 7 — 12/03/2026)

### Notificações & PWA
- ✅ `useNotifications` hook — notificações in-app com suporte a Web Push
  - Monitora jobs falhos e malware detectado via realtime
  - Browser notifications para alertas críticos
- ✅ `NotificationBell` — sino de notificações no header do dashboard
- ✅ PWA completa com manifest, service worker e icons (configurada anteriormente)

## ✅ Concluído (Sprint 8 — 12/03/2026)

### Qualidade & Testes E2E
- ✅ `playwright.config.ts` — configuração Playwright com projetos Desktop + Mobile
- ✅ `e2e/dashboard.spec.ts` — 10 cenários E2E cobrindo:
  - Landing page, login, signup, pricing, 404
  - Navegação entre páginas de auth
  - Tema dark por padrão
  - PWA manifest acessível
  - Viewport mobile responsivo
  - CTA buttons visíveis

## ✅ Concluído (Sprint 9 — 12/03/2026)

### Código Limpo, Code-Splitting & Dashboard Customizável
- ✅ **Tipos extraídos** — `src/types/dashboard.ts` centraliza todas as interfaces
- ✅ **`useDashboardData.ts` removido** — agora apenas re-exporta tipos para backward compat
- ✅ **React.lazy em todas as rotas** — 130+ páginas com code-splitting via `React.lazy` + `Suspense`
  - Bundle inicial reduzido drasticamente (só carrega a rota atual)
  - `RouteFallback` animado para transições entre páginas
- ✅ **`CustomizableDashboard`** — componente drag-and-drop com `react-grid-layout` v2
  - Layout persistido em localStorage
  - Modo locked/unlocked com indicadores visuais
  - Reset para layout padrão
- ✅ **`useURLFilters`** hook — filtros persistidos em URL query params
  - Suporte a tab, search, status via `?tab=agents&q=server&status=online`
  - Estado compartilhável via URL
- ✅ **Rate Limiting Server-Side** — Edge Function `rate-limit-check`
  - Sliding window por endpoint category (auth: 10/min, mutation: 30/min, export: 5/5min)
  - Fail-open design (não bloqueia se rate limiter falhar)
  - Complementa o rate limiting frontend existente

## ✅ Concluído (Sprint 10 — 13/03/2026)

### Dashboard Customizável & Filtros Avançados
- ✅ **`CustomizableDashboard`** — componente drag-and-drop com `react-grid-layout`
  - Layout persistido em localStorage
  - Modo locked/unlocked com indicadores visuais
  - Reset para layout padrão
- ✅ **`useURLFilters`** hook — filtros persistidos em URL query params
  - Suporte a tab, search, status via `?tab=agents&q=server&status=online`
  - Estado compartilhável via URL

## ✅ Concluído (Sprint 11 — 13/03/2026)

### Segurança Server-Side & Rate Limiting
- ✅ **Rate Limiting Server-Side** — Edge Function `rate-limit-check`
  - Sliding window por endpoint category (auth: 10/min, mutation: 30/min, export: 5/5min)
  - Fail-open design (não bloqueia se rate limiter falhar)
  - Complementa o rate limiting frontend existente

## ⏳ Pendente (Próximos Sprints)

| # | Área | Prioridade | Status |
|---|------|-----------|--------|
| 1 | Particionamento de tabelas grandes (jobs, audit_logs) | BAIXO | TODO |
| 2 | Cobertura de testes >80% | MÉDIO | TODO |
| 3 | Testes E2E autenticados (dashboard, CSV, PDF) | MÉDIO | TODO |
