
# Plano de Melhorias Completo — CyberShield (Março 2026)

---

## 🔴 CRÍTICO — Dívida Técnica & Estabilidade

### 1. Refatoração de Arquivos Gigantes
| Arquivo | Linhas | Ação |
|---------|--------|------|
| `ServerDashboard.tsx` | **1787** | Quebrar em ~10 componentes menores (cards, gráficos, tabs, fetchers) |
| `types.ts` (auto-gerado) | Enorme | Sem ação direta, mas indica schema muito grande — avaliar normalização |

**Por quê:** Arquivos >300 linhas causam builds lentos, dificultam manutenção e aumentam risco de regressão.

### 2. Performance do Dashboard
- [ ] Implementar **lazy loading** nas tabs do ServerDashboard (só carregar dados da tab ativa)
- [ ] Adicionar **React.memo** e **useMemo** nos componentes de gráficos
- [ ] Implementar **virtualização** em listas longas (agentes, jobs, alertas)
- [ ] Adicionar **skeleton loaders** durante carregamento de dados

### 3. Tratamento de Erros Global
- [ ] Implementar **ErrorBoundary** com fallback UI em todas as rotas admin
- [ ] Adicionar **retry automático** nas queries do React Query (já parcial)
- [ ] Criar página de **status de saúde** do sistema visível ao admin
- [ ] Implementar **toast de reconexão** quando a conexão com backend cair

---

## 🟠 ALTO — UX & Usabilidade

### 4. Landing Page
- [ ] Remover seções não utilizadas (`TargetAudienceSection`, `SocialProofSection`, `DiagnosticPreviewSection`, etc. — importadas mas não renderizadas)
- [ ] Adicionar **animações de scroll** (framer-motion) para engajamento
- [ ] Implementar **A/B testing** no CTA principal
- [ ] Melhorar **SEO**: structured data (JSON-LD) para SaaS/Software

### 5. Onboarding & First-Time Experience
- [ ] Criar **wizard de primeiro acesso** guiado (instalar agente → ver dashboard → configurar alertas)
- [ ] Adicionar **empty states** informativos em todas as telas (quando sem agentes/jobs/alertas)
- [ ] Implementar **checklist de setup** persistente no sidebar
- [ ] Adicionar **tooltips contextuais** nos KPIs do dashboard

### 6. Mobile & Responsividade
- [ ] Auditar todas as páginas admin em **viewport mobile** (muitas tabelas não responsivas)
- [ ] Melhorar `MobileBottomNav` com notificações de alerta
- [ ] Testar PWA offline mode (já tem `vite-plugin-pwa`)

### 7. Internacionalização (i18n)
- [ ] Auditar cobertura — muitos textos ainda hardcoded em PT-BR
- [ ] Completar traduções EN para expansão internacional
- [ ] Padronizar formatação de datas (já usa `formatBrazilDateTime`, expandir)

---

## 🟡 MÉDIO — Funcionalidades & Produto

### 8. Dashboard Analytics Avançado
- [ ] Adicionar **comparativo temporal** (semana passada vs. esta semana)
- [ ] Implementar **heat map** de atividade dos agentes
- [ ] Criar **relatório executivo** exportável em PDF (já tem jspdf)
- [ ] Dashboard de **tendências de segurança** (score ao longo do tempo)

### 9. Notificações & Alertas
- [ ] Implementar **notificações push** via PWA (Service Worker)
- [ ] Criar **digest diário** por email (resumo de segurança)
- [ ] Adicionar **escalation automático** — alerta não resolvido em X horas → notificar superior
- [ ] Webhook configurável para **integração com Slack/Teams**

### 10. Gestão de Agentes
- [ ] Criar **grupos/tags de agentes** com bulk actions
- [ ] Implementar **políticas por grupo** (ex: scan frequency por departamento)
- [ ] Adicionar **mapa visual** da rede de agentes
- [ ] Melhorar **diagnóstico remoto** com terminal interativo

### 11. Compliance & Relatórios
- [ ] Automatizar geração de **relatórios LGPD/ANPD** com assinatura digital
- [ ] Implementar **calendário de compliance** com lembretes automáticos
- [ ] Criar **export de evidências** em formato aceito por auditores (CSV + PDF + hash)
- [ ] Dashboard de **gap analysis** SOC2 com progresso visual

---

## 🔵 BAIXO — Infraestrutura & DevOps

### 12. Testes Automatizados
- [ ] Aumentar cobertura de **testes unitários** (domain logic + hooks)
- [ ] Adicionar **testes de integração** para flows críticos (login → dashboard → criar job)
- [ ] Implementar **visual regression testing** para componentes UI
- [ ] Configurar **CI/CD pipeline** com gates de qualidade

### 13. Monitoramento & Observabilidade
- [ ] Implementar **APM frontend** (Web Vitals: LCP, FID, CLS)
- [ ] Adicionar **tracing** em edge functions (correlação de requests)
- [ ] Criar **dashboard de saúde do sistema** (crons, edge functions, DB)
- [ ] Monitorar **taxa de erros** por endpoint/função

### 14. Segurança Contínua
- [ ] Executar `npm audit` periódico e resolver vulnerabilidades
- [ ] Implementar **CSP headers** rigorosos
- [ ] Adicionar **rate limiting** no frontend (debounce em forms)
- [ ] Revisar e atualizar **RLS policies** trimestralmente (conforme ADR-037)

### 15. Database & Schema
- [ ] Avaliar **particionamento** de tabelas grandes (audit_logs, jobs, agent_metrics)
- [ ] Implementar **archival automático** de dados >90 dias
- [ ] Criar **índices otimizados** para queries mais frequentes
- [ ] Documentar schema com ERD atualizado

---

## 📋 Priorização Sugerida (Próximas 4 Sprints)

| Sprint | Foco | Items |
|--------|------|-------|
| **Sprint 1** (Semana 1-2) | Estabilidade | #1 Refatorar ServerDashboard, #2 Performance, #3 Error handling |
| **Sprint 2** (Semana 3-4) | UX | #4 Landing page, #5 Onboarding, #6 Mobile |
| **Sprint 3** (Semana 5-6) | Produto | #8 Analytics, #9 Notificações, #11 Compliance |
| **Sprint 4** (Semana 7-8) | Infra | #12 Testes, #13 Monitoramento, #14 Segurança |

---

## Métricas de Sucesso

| Métrica | Atual (Estimado) | Meta |
|---------|-------------------|------|
| Tempo de carregamento Dashboard | ~3-5s | <1.5s |
| Cobertura de testes | ~5% | >40% |
| Lighthouse Score (Landing) | ~70 | >90 |
| Arquivos >500 linhas | ~15+ | <5 |
| Empty states cobertos | ~20% | 100% |
| i18n cobertura EN | ~30% | >90% |

---

*Última atualização: 2026-03-12*
