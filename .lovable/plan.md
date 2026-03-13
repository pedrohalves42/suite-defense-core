
# Plano de Melhorias — CyberShield (Atualizado 13/03/2026)

## ✅ Concluído (Sprints 1-11 — 12-13/03/2026)

<details>
<summary>Ver sprints anteriores concluídas</summary>

### Sprint 1 — Refatoração do ServerDashboard (1787 → ~130 linhas)
### Sprint 2 — Skeleton Loaders, Mobile, PDF, Testes
### Sprint 3 — Performance & Segurança (Rate Limiter, ErrorBoundary, SessionGuard)
### Sprint 4 — Usabilidade (CSV Export, Breadcrumbs, Filtros)
### Sprint 5 — i18n EN, ARIA/Acessibilidade, Keyboard Navigation
### Sprint 6 — React Query, VirtualizedList, Web Vitals APM
### Sprint 7 — Notificações In-App, Web Push, PWA
### Sprint 8 — Playwright E2E (10 cenários)
### Sprint 9 — Code-Splitting, Dashboard Customizável, Rate Limiting Server-Side
### Sprint 10 — Dashboard drag-and-drop, useURLFilters
### Sprint 11 — Edge Function rate-limit-check

</details>

---

## ✅ Fase 1 — Remediação Ativa nos Endpoints (CONCLUÍDA)

**Objetivo:** Transformar o sistema de passivo (só observa) para ativo (detecta E age).

### Sprint 12 — Jobs de Remediação Automática ✅
### Sprint 13 — Remediação Inteligente (SOAR Ativo) ✅

---

## 🟠 Fase 2 — Simplificação da UI (ALTO)

**Objetivo:** Reduzir ~110 páginas para ~40 páginas consolidadas sem perder funcionalidade.

### Sprint 14 — Consolidação de Páginas de Agentes ✅
- Criado `AgentCenter.tsx` — página unificada com 6 abas: Computadores, Grupos, Etiquetas, Histórico, Versões, Inativos
- Rotas antigas (agent-health, agent-groups, agent-tags, agent-timeline, agent-versions, archived-agents) redirecionam para agent-center
- Sidebar e mobile nav atualizados para nova rota consolidada

---

## 🟠 Fase 2 — Simplificação da UI (ALTO)

**Objetivo:** Reduzir ~110 páginas para ~40 páginas consolidadas sem perder funcionalidade.

### Sprint 14 — Consolidação de Páginas de Agentes ✅

### Sprint 15 — Consolidação de Páginas de Segurança ✅
- Criado `VulnerabilityCenter.tsx` — 3 abas: Vulnerabilidades, Software Arriscado, Acessos e Senhas
- Criado `NetworkSecurityCenter.tsx` — 3 abas: Sites Acessados, Filtro DNS, Mapa de Segurança
- Criado `AssetSecurityCenter.tsx` — 3 abas: Programas, Programas Ocultos, Exposição de Dados
- Criado `ThreatCenter.tsx` — 3 abas: Alertas, Ameaças Conhecidas, Teste de Resistência
- ~12 rotas antigas redirecionam para as 4 novas páginas consolidadas
- Sidebar reduzido de 12 itens de segurança para 7

### Sprint 16 — Navegação & Menu ✅
- Command Palette (Cmd+K) — busca global por todas as páginas com keywords em PT-BR
- Sistema de Favoritos — usuário pode fixar/desfixar páginas via ⭐ no Command Palette
- Favoritos aparecem no topo do sidebar automaticamente
- Sidebar já reorganizado em 5 seções: Overview, Proteção, Organização, Normas, Ferramentas

---

## ✅ Fase 3 — Onboarding MSP Simplificado (CONCLUÍDO)

### Sprint 17 — Wizard de Onboarding ✅
- Wizard 4 passos: Empresa → Plano → Primeiro Agente → Verificação
- Auto-geração de enrollment key no wizard
- Script de instalação one-liner copiável (PowerShell/Bash)
- Detecção automática de primeiro heartbeat com feedback visual 🎉
- Template de políticas por tipo de empresa (escritório, clínica, escola, personalizado)
- Acessível via sidebar "Novo Cliente" e Command Palette

### Sprint 18 — Self-Service & Portal
| # | Tarefa | Prioridade |
|---|--------|-----------|
| 1 | Convite por email — admin envia link de signup pré-configurado ao cliente | ALTA |
| 2 | Portal do cliente com wizard próprio de instalação | MÉDIA |
| 3 | Status page pública por tenant (uptime dos agentes) | BAIXA |
| 4 | Relatório automático semanal enviado por email ao cliente | MÉDIA |

---

## 🟢 Fase 4 — Cobertura de Testes (MÉDIO)

**Objetivo:** Atingir >80% de cobertura com testes significativos.

### Sprint 19 — Testes Unitários Core
| # | Tarefa | Prioridade |
|---|--------|-----------|
| 1 | Testes para todas as entidades de domínio (Job, Agent, VulnerabilityScan, etc.) | ALTA |
| 2 | Testes para todos os use cases (AutoRemediate, OrchestratePatch, BlockUSB, etc.) | ALTA |
| 3 | Testes para value objects (AgentId, TenantId, etc.) | MÉDIA |
| 4 | Testes para hooks críticos (useUnifiedMetrics, useDashboardQueries) | ALTA |
| 5 | Mock de SupabaseJobRepository e adapters | MÉDIA |

### Sprint 20 — Testes E2E Autenticados
| # | Tarefa | Prioridade |
|---|--------|-----------|
| 1 | Setup de auth fixtures (usuário de teste com tenant) | ALTA |
| 2 | E2E: Login → Dashboard → Verificar métricas carregam | ALTA |
| 3 | E2E: Exportar CSV e verificar download | MÉDIA |
| 4 | E2E: Gerar PDF executivo e verificar conteúdo | MÉDIA |
| 5 | E2E: Criar job, verificar na lista, cancelar | ALTA |
| 6 | E2E: Fluxo completo de onboarding (wizard → enrollment → verificação) | ALTA |

---

## 🔵 Fase 5 — Melhorias Complementares (BAIXO)

### Sprint 21 — Otimização de Edge Functions
| # | Tarefa | Prioridade |
|---|--------|-----------|
| 1 | Consolidar 7 funções de cleanup em 1 `system-maintenance` | MÉDIA |
| 2 | Consolidar 10 funções de notificação em 1 `notification-dispatcher` | MÉDIA |
| 3 | Consolidar 5 funções de sync em 1 `release-sync` | MÉDIA |
| 4 | Documentar todas as funções restantes em `docs/EDGE_FUNCTIONS.md` | BAIXA |

### Sprint 22 — Performance & Escalabilidade
| # | Tarefa | Prioridade |
|---|--------|-----------|
| 1 | Particionamento de `jobs` por mês (range partition) | BAIXA |
| 2 | Particionamento de `audit_logs` por mês | BAIXA |
| 3 | Índices compostos para queries mais frequentes | MÉDIA |
| 4 | Cache de compliance score (evitar recálculo a cada request) | MÉDIA |

---

## 📊 Metas por Fase

| Fase | Meta | Métrica de Sucesso |
|------|------|-------------------|
| **Fase 1** | Sistema age nos endpoints | ≥5 tipos de remediação automática funcionando |
| **Fase 2** | UI intuitiva | ≤45 páginas, <3 cliques para qualquer ação |
| **Fase 3** | Onboarding rápido | Primeiro agente online em <5 min |
| **Fase 4** | Código confiável | >80% cobertura, 0 falsos positivos em CI |
| **Fase 5** | Manutenção sustentável | <100 edge functions, queries <200ms p95 |

---

## 📋 Ordem de Execução Recomendada

```
Sprint 12-13 (Remediação) → Sprint 14-16 (UI) → Sprint 17-18 (Onboarding) → Sprint 19-20 (Testes) → Sprint 21-22 (Otimização)
```

Cada sprint é independente e pode ser reordenada conforme prioridade do negócio.
