# Plano de Cobertura de Testes — Meta SOC 2 (>80%)

| Campo | Valor |
|-------|-------|
| **Codigo** | TCP-001 |
| **Versao** | 1.0 |
| **Status** | Em Execucao |
| **Data** | 2026-03-31 |
| **Meta** | >80% cobertura em modulos criticos |
| **Criterio SOC 2** | CC7.1, CC8.1 |

---

## 1. Diagnostico Atual

| Metrica | Valor |
|---------|-------|
| Arquivos fonte (src/) | ~1.020 |
| Edge Functions | 248 |
| Arquivos de teste existentes | 58 |
| Cobertura estimada por contagem de arquivos | ~5.6% |
| Testes de integracao Edge Functions | 21 |
| Testes unitarios frontend/domain | 37 |

### 1.1 Gaps Criticos

| Area | Arquivos | Testes Existentes | Gap |
|------|----------|-------------------|-----|
| Edge Functions (ciclo agente) | 12 | 4 | 8 |
| Edge Functions (seguranca) | 18 | 2 | 16 |
| Edge Functions (automacao/SOAR) | 15 | 2 | 13 |
| Edge Functions (telemetria) | 10 | 3 | 7 |
| Edge Functions (admin) | 20 | 7 | 13 |
| Edge Functions (AI) | 16 | 0 | 16 |
| Edge Functions (cleanup/ops) | 12 | 0 | 12 |
| Edge Functions (notificacao) | 8 | 0 | 8 |
| Hooks React | ~45 | 10 | 35 |
| Componentes React | ~200 | 3 | 197 |
| Domain entities/VOs | ~30 | 12 | 18 |
| Application use cases | ~15 | 4 | 11 |
| Shared utilities (_shared/) | ~25 | 3 | 22 |

---

## 2. Estrategia por Fases

### Fase 1 — Fundacao Critica (Semana 1-2) — Meta: 30%

**Prioridade: Seguranca e Ciclo de Vida do Agente**

#### 1.1 Edge Functions Tier 1 (Ciclo de Vida)
Testes de integracao obrigatorios para:

| Funcao | Cenarios Minimos |
|--------|-----------------|
| `heartbeat` | auth valida, token invalido, agente inexistente, payload malformado, tenant mismatch |
| `enroll-agent` | enrollment valido, key expirada, key revogada, nome duplicado, quota excedida |
| `poll-jobs` | jobs pendentes, sem jobs, agente desativado, filtro de tipo |
| `submit-job-result` | resultado valido, job inexistente, job ja completado, payload grande |
| `check-agent-updates` | update disponivel, sem update, versao invalida |
| `get-agent-config` | config padrao, config customizada, agente arquivado |

#### 1.2 Edge Functions Tier 1 (Seguranca)
| Funcao | Cenarios Minimos |
|--------|-----------------|
| `validate-hmac-signature` | assinatura valida, invalida, replay, nonce duplicado, timestamp expirado |
| `quarantine-agent` | quarentena valida, permissao negada, agente ja quarentenado |
| `auto-quarantine` | trigger automatico, threshold, notificacao |
| `scan-vulnerabilities` | scan completo, CVE match, sem vulnerabilidades |
| `send-security-alert` | email + webhook, falha parcial, deduplicacao |

#### 1.3 Middlewares Compartilhados (_shared/)
| Modulo | Cenarios |
|--------|----------|
| `serve-tenant.ts` | JWT valido, expirado, tenant mismatch, rate limit |
| `serve-agent.ts` (dentro de serve-tenant) | token valido, revogado, agente arquivado |
| `assert-internal-caller.ts` | service role, anon key, sem header |
| `cors.ts` | origin permitida, origin bloqueada, OPTIONS |
| `rate-limiter.ts` | abaixo do limite, no limite, acima, reset |
| `hmac-validation.ts` | valido, invalido, replay |
| `logger.ts` | structured output, campos obrigatorios |
| `fetch-with-timeout.ts` | sucesso, timeout, erro de rede |

### Fase 2 — Cobertura de Negocios (Semana 3-4) — Meta: 55%

#### 2.1 Edge Functions Tier 2 (Telemetria e Ingestao)
| Funcao | Cenarios |
|--------|----------|
| `submit-system-metrics` | metricas validas, payload grande, campos ausentes |
| `submit-software-inventory` | inventario completo, delta, duplicatas |
| `submit-web-activity` | atividade valida, URL bloqueada, batch |
| `submit-processes` | lista valida, processo suspeito |
| `collect-router` | tipo valido, tipo invalido, certificates, usb-devices |
| `submit-router` | roteamento correto para cada tipo |
| `flush-event-buffer` | buffer cheio, buffer vazio, falha parcial |

#### 2.2 Edge Functions Tier 2 (Admin)
| Funcao | Cenarios |
|--------|----------|
| `create-job` | job valido, tipo invalido, permissao, blast radius |
| `admin-create-user` | usuario valido, email duplicado, role invalida |
| `list-users` | paginacao, filtros, tenant isolation |
| `update-user-role` | promocao, rebaixamento, auto-alteracao bloqueada |
| `generate-enrollment-key` | geracao, limite de keys, expiracao |

#### 2.3 Domain Layer (src/domain/)
| Modulo | Cenarios |
|--------|----------|
| Todas as entidades | criacao, validacao, transicoes de estado |
| Todos os value objects | igualdade, validacao, imutabilidade |
| Compliance score | calculo, thresholds, edge cases |
| Risk score | calculo, fatores, agregacao |

#### 2.4 Hooks Criticos (src/hooks/)
| Hook | Cenarios |
|------|----------|
| `useAuth` | login, logout, sessao expirada, refresh |
| `useActiveTenant` | selecao, switch, sem tenant |
| `useTenant` | dados do tenant, loading, erro |
| `useDashboardQueries` | dados carregados, vazio, erro |
| `useAgentHealthAlerts` | alertas ativos, sem alertas, threshold |
| `useFavorites` | adicionar, remover, persistencia |

### Fase 3 — Cobertura Ampla (Semana 5-6) — Meta: 70%

#### 3.1 Edge Functions Tier 3 (Automacao e SOAR)
| Funcao | Cenarios |
|--------|----------|
| `evaluate-automation-rules` | regra match, sem match, multiplas regras, conflito |
| `soar-engine` | playbook trigger, acao executada, rollback |
| `execute-playbook` | execucao completa, falha parcial, timeout |
| `execute-playbook-action` | acao valida, acao bloqueada, dry-run |
| `auto-remediate` | remediacao automatica, threshold, notificacao |
| `evaluate-playbook-triggers` | trigger valido, condicoes nao atendidas |

#### 3.2 Edge Functions Tier 3 (Notificacoes)
| Funcao | Cenarios |
|--------|----------|
| `notification-router` | email, telegram, webhook, dispatch |
| `security-alert-dispatcher` | alerta critico, deduplicacao, multi-canal |
| `send-invite` | convite valido, email invalido, limite |

#### 3.3 Edge Functions Tier 3 (Cleanup/Ops)
| Funcao | Cenarios |
|--------|----------|
| `cleanup-router` | telemetria, stuck-jobs, jobs, stale-reports |
| `ops-router` | roteamento namespace, acao invalida, auth |
| `maintenance-cron` | execucao completa, falha parcial |

#### 3.4 Componentes React Criticos
| Componente | Cenarios |
|------------|----------|
| Dashboard principal | renderizacao, loading, erro, vazio |
| Tabela de agentes | listagem, filtros, paginacao, acoes |
| Formulario de jobs | criacao, validacao, submissao |
| Painel de alertas | alertas ativos, dismissal, detalhes |
| Login/Auth forms | validacao, submissao, erros |

### Fase 4 — Hardening (Semana 7-8) — Meta: >80%

#### 4.1 Edge Functions Tier 4 (AI)
| Funcao | Cenarios |
|--------|----------|
| `ai-router` | roteamento por modelo, fallback, rate limit |
| `ai-agent-assist` | sugestao, contexto insuficiente, timeout |
| `ai-correlate-alerts` | correlacao, sem correlacao, falso positivo |
| `ai-security-copilot` | analise, recomendacao, limite de tokens |
| `ai-analyze-agent` | analise completa, dados insuficientes |

#### 4.2 Edge Functions Tier 4 (Compliance/Reports)
| Funcao | Cenarios |
|--------|----------|
| `calculate-compliance` | calculo completo, framework especifico |
| `generate-compliance-report` | geracao, template, assinatura |
| `export-evidence-bundle` | exportacao completa, filtros, formato |
| `verify-log-integrity` | cadeia integra, cadeia quebrada |

#### 4.3 Edge Functions Tier 5 (Billing/Stripe)
| Funcao | Cenarios |
|--------|----------|
| `stripe-webhook` | evento valido, assinatura invalida, idempotencia |
| `create-checkout` | checkout valido, plano invalido |
| `check-subscription` | ativa, expirada, trial |

#### 4.4 Testes E2E Expandidos
| Fluxo | Cenarios |
|-------|----------|
| Onboarding completo | registro, primeiro login, primeiro agente |
| Ciclo de vida do agente | enrollment, heartbeat, job, resultado |
| Incidente end-to-end | deteccao, alerta, resposta, resolucao |
| Compliance workflow | scan, report, evidencia, auditoria |

---

## 3. Padrao de Teste Obrigatorio

### 3.1 Edge Functions (Deno)

```typescript
// supabase/functions/__tests__/<category>/<function-name>.test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("<function-name> - cenario positivo", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/<function-name>`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ /* payload */ }),
  });
  const body = await response.text();
  assertEquals(response.status, 200);
});

Deno.test("<function-name> - payload invalido", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/<function-name>`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({}),
  });
  const body = await response.text();
  assertEquals(response.status, 400);
});
```

### 3.2 Frontend (Vitest + Testing Library)

```typescript
// src/__tests__/<category>/<module>.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

describe('<module>', () => {
  it('cenario positivo', () => { /* ... */ });
  it('cenario de erro', () => { /* ... */ });
  it('cenario de borda', () => { /* ... */ });
});
```

### 3.3 Requisitos por Teste

Cada teste DEVE ter:
- **Nome descritivo** do cenario
- **Arrange**: setup explicito
- **Act**: acao unica
- **Assert**: verificacao especifica
- **Cleanup**: liberacao de recursos (especialmente em Deno: `await response.text()`)

---

## 4. Metricas de Acompanhamento

| Metrica | Ferramenta | Meta Fase 1 | Meta Fase 2 | Meta Fase 3 | Meta Final |
|---------|------------|-------------|-------------|-------------|------------|
| Line coverage (src/) | Vitest + c8 | 25% | 45% | 65% | >80% |
| Branch coverage (src/) | Vitest + c8 | 20% | 40% | 55% | >70% |
| Edge Function tests | Deno test | 30 | 55 | 85 | >120 |
| E2E flows | Playwright | 5 | 10 | 15 | >20 |
| Mutation score | Stryker (futuro) | - | - | - | >60% |

---

## 5. Quality Gates no CI

```yaml
# Adicionar ao .github/workflows/ci.yml
- name: Check coverage threshold
  run: |
    npx vitest run --coverage --reporter=json
    node scripts/check-coverage.js --min-lines=80 --min-branches=70
```

### 5.1 Regras de Bloqueio

| Gate | Threshold | Acao |
|------|-----------|------|
| Line coverage total | <80% | Bloqueia merge em main |
| Branch coverage total | <70% | Bloqueia merge em main |
| Novos arquivos sem teste | >0 | Warning (bloqueia apos Fase 3) |
| Edge Function sem teste de integracao | >0 | Bloqueia apos Fase 2 |
| Teste falhando | >0 | Bloqueia sempre |

---

## 6. Prioridade de Implementacao (Ordem Exata)

### Sprint 1 (Semana 1)
1. `_shared/` middlewares (serve-tenant, assert-internal-caller, rate-limiter, hmac-validation)
2. `heartbeat` (funcao mais chamada)
3. `enroll-agent` (entry point critico)
4. `validate-hmac-signature` (seguranca)
5. Domain entities e value objects restantes

### Sprint 2 (Semana 2)
6. `poll-jobs` + `submit-job-result` (ciclo de jobs)
7. `quarantine-agent` + `auto-quarantine` (seguranca)
8. `scan-vulnerabilities` (compliance)
9. Hooks de auth e tenant
10. `collect-router` + `submit-router`

### Sprint 3 (Semana 3)
11. Funcoes de telemetria (submit-system-metrics, submit-software-inventory, etc.)
12. Funcoes admin (create-job, admin-create-user, list-users)
13. Domain layer completo
14. Hooks de dashboard

### Sprint 4 (Semana 4)
15. `evaluate-automation-rules` + SOAR engine
16. `notification-router` + security-alert-dispatcher
17. `cleanup-router` + `ops-router`
18. Componentes React criticos

### Sprint 5-6 (Semana 5-6)
19. Funcoes de AI
20. Funcoes de compliance/reports
21. Funcoes de billing/Stripe
22. Componentes React secundarios

### Sprint 7-8 (Semana 7-8)
23. E2E flows expandidos
24. Testes de invariantes multi-tenant
25. Testes de carga (k6)
26. Mutation testing setup

---

## 7. Riscos e Mitigacoes

| Risco | Probabilidade | Mitigacao |
|-------|---------------|-----------|
| Testes de integracao flakey | Alta | Retry com jitter, seed data isolada, cleanup |
| Dependencia de servicos externos | Media | Mocks para Stripe, Resend, Telegram |
| Tempo insuficiente | Alta | Priorizar Tier 1-2, automatizar geracao de boilerplate |
| Conflitos de merge | Media | Branch dedicada, integracoes frequentes |
| Dados de teste poluindo producao | Baixa | Usar tenant de teste dedicado, cleanup automatico |

---

## 8. Evidencia SOC 2

Este plano atende aos criterios:

| Criterio SOC 2 | Evidencia |
|----------------|-----------|
| CC7.1 - Monitoramento | Testes automatizados no CI, dashboards de cobertura |
| CC8.1 - Mudancas | Quality gates bloqueando merge sem testes |
| CC6.1 - Seguranca | Testes especificos de autenticacao, autorizacao, HMAC |
| CC3.1 - Risco | Testes de invariantes multi-tenant |
| CC7.2 - Anomalias | Testes de cenarios de falha e borda |

---

## Historico

| Versao | Data | Autor | Alteracoes |
|--------|------|-------|------------|
| 1.0 | 2026-03-31 | CyberShield Engineering | Versao inicial |
