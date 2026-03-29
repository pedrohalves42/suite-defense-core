
# Auditoria Forense de Valuation Tecnico -- CyberShield Platform

**Perito: Rafael V. Monteiro (persona)**
**Data: 2026-03-28**
**Metodo: Analise direta do repositorio, codigo-fonte como unica fonte de verdade**

---

## Etapa 1 -- Inventario Estrutural Real

### Arvore do Repositorio (verificada)

```text
cybershield/
├── src/                          # Frontend React+TS
│   ├── components/   (50+ dirs, 50+ standalone)
│   ├── pages/        (34 standalone + admin/ com 113 paginas)
│   ├── domain/       (21 entities, 7 services, ports, VOs, events)
│   ├── hooks/        (140+ hooks)
│   ├── infrastructure/ (adapters, mappers, repositories)
│   ├── i18n/         (internacionalizacao)
│   └── integrations/ (supabase client auto-gerado)
│
├── supabase/
│   ├── functions/    (259 edge functions)
│   │   ├── _shared/  (70+ modulos compartilhados)
│   │   └── __tests__/ (17 arquivos de teste)
│   └── migrations/   (1004 migrations SQL!)
│
├── public/agent-scripts/  (12 scripts: Win/Linux/macOS v3/v4/v5 + migracoes)
├── dns-filter/            (servico Go: DNS filter local)
├── electron/              (wrapper desktop)
├── e2e/                   (64 specs Playwright)
├── contracts/             (schemas, invariants)
├── eslint-plugin-multitenant/ (plugin ESLint custom)
├── tools/                 (audit scripts, SQL guards)
├── scripts/               (CI gates, security SQL)
├── docs/                  (130+ documentos)
├── .github/workflows/     (13 workflows CI/CD)
└── tests/                 (17 scripts de validacao manual)
```

### Metricas Quantitativas Brutas

| Metrica | Valor |
|---------|-------|
| Edge Functions | **259** diretorios |
| Migrations SQL | **1004** arquivos |
| Paginas admin | **113** componentes |
| Hooks React | **140+** |
| Entities de dominio | **21** |
| Domain Services | **7** |
| Specs E2E (Playwright) | **64** |
| Testes unitarios (dominio) | **15** |
| Testes de hooks | **10** |
| Testes de edge functions | **17** |
| Workflows CI/CD | **13** |
| Agent Windows v5 | **7.184 linhas** PowerShell |
| Agent Linux v5 | **2.294 linhas** Bash |
| Agent macOS v5 | **2.247 linhas** Bash |
| DNS Filter (Go) | **6 arquivos, ~930 linhas** |
| Modulos _shared | **70+** |
| Docs | **130+** markdown |

### Linguagens e Frameworks

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions/Deno)
- **Agente Windows**: PowerShell 5.1+ (SYSTEM context)
- **Agente Linux/macOS**: Bash (systemd/cron/LaunchDaemon)
- **DNS Filter**: Go (Windows service)
- **Desktop**: Electron (wrapper basico)
- **CI/CD**: GitHub Actions (13 workflows)
- **Testes**: Vitest (unit), Playwright (E2E), Deno test (edge functions)
- **ESLint custom**: Plugin multitenant com regra `no-supabase-query-without-tenant`

---

## Etapa 2 -- Arquitetura Real (Reconstruida do Codigo)

### Backend/Edge Functions -- Middleware Padronizado

O sistema possui um middleware de tres camadas realmente implementado em `serve-tenant.ts` (442 linhas):

- **`serveTenant()`**: JWT + validacao de tenant + rate limiting opcional
- **`serveAgent()`**: X-Agent-Token + token_hash lookup + gzip decompression
- **`servePublic()`**: Sem auth, CORS, requestId
- **`assertInternalCaller()`**: X-Internal-Secret / service_role (cron/internal)

**Status de migracao real**: ~171 funcoes ja referenciam os middlewares. ~88 ainda usam `Deno.serve()` diretamente, sendo 26 com HMAC que exigem raw body (arquiteturalmente justificado).

### Infraestrutura Compartilhada (_shared) -- Realmente Implementada

| Modulo | Funcao | Complexidade |
|--------|--------|-------------|
| `hmac.ts` (443 linhas) | HMAC-SHA256 com clock skew recovery | Alta |
| `dlq.ts` (269 linhas) | Dead-letter queue com backoff exponencial + jitter | Alta |
| `kv-cache.ts` (84 linhas) | Cache KV com TTL em tabela | Media |
| `rate-limit.ts` + middleware | Rate limiting atomico via RPC | Alta |
| `logger.ts` | Structured logging | Media |
| `crypto-utils.ts` | timingSafeEqual, hash, HMAC utils | Alta |
| `feature-flags.ts` | Feature flags por tenant | Media |
| `ip-allowlist.ts` | IP allowlist para admin | Media |
| `agent-auth.ts` | Auth de agente via token_hash | Alta |
| `verify-result-signature.ts` | ECDSA/RSA signature verification | Alta |
| `sanitize.ts` / `ai-sanitizer.ts` | Input sanitization | Media |
| `hexagonal/` (16 modulos) | Ports/Adapters para AI/cache/feedback | Alta |
| `health-probe.ts` | Health probes | Baixa |
| `request-context.ts` | RequestId propagation | Media |

### Fluxos Fim-a-Fim Implementados (Comprovados)

1. **Enrollment**: `generate-enrollment-key` -> `enroll-agent` (com token_hash + HMAC secret)
2. **Heartbeat**: Agente -> `heartbeat` (HMAC verify, clock skew, FSM state, force update)
3. **Job lifecycle**: `create-job` -> `poll-jobs` -> Agente executa -> `submit-job-result` (com side-effects router, ECDSA verification)
4. **Telemetria**: 12+ endpoints de submit (software, web activity, antivirus, network, certificates, disk, processes, lineage, ransomware, backup, USB, data exposure)
5. **Auto-remediacao**: `auto-remediate`, `auto-quarantine`, `execute-playbook`, `execute-playbook-action`
6. **AI Router**: `ai-router` com 16 handlers (analyze, correlate, copilot, etc.)
7. **Compliance**: `calculate-compliance`, `generate-compliance-report`, `scheduled-compliance-refresh`
8. **Alerting**: `dispatch-notification`, `send-notification`, `send-telegram-notification`, `send-email-notification`, `send-whatsapp-notification`
9. **SOAR**: `soar-engine`, `evaluate-automation-rules`, `evaluate-playbook-triggers`
10. **Stripe billing**: `create-checkout`, `stripe-webhook`, `manage-subscription`, `customer-portal`

---

## Etapa 3 -- Investigacao Profunda do Agente

### Agente Windows v5.0.15 (7.184 linhas)

**Realmente implementado** (comprovado pelo codigo):

- **Persistencia**: Scheduled Task como SYSTEM (S-1-5-18)
- **FSM**: INITIALIZING -> RUNNING -> DEGRADED -> SAFE_MODE (com transicoes validadas)
- **Heartbeat**: HMAC-SHA256, clock skew tolerance, dynamic intervals do servidor
- **27 tipos de job**: collect_*, scan_*, remediate_*, update_*, integration_test_v3
- **Coleta**: processos, software (registry-based, nao Win32_Product), antivirus (SecurityCenter2), rede, disco, certificados, USB, web activity, DNS, backup, process lineage
- **Deteccao**: LOLBins, Office macro spawns, encoded PowerShell, port scans, ransomware heuristics (rename storms), CPU burst
- **Seguranca**: ACL hardening (SYSTEM + Admins), secrets em arquivos protegidos (nao CLI), anti-debug (ISE + .NET debugger), StrictMode, mutex single-instance, TOCTOU self-healing
- **Criptografia**: ECDSA-P256 assinatura de resultados, RSA-2048 fallback, Ed25519 verification de releases, SHA-256 hash chain
- **Performance**: CIM caching, log buffering, HashSet O(1) lookups, adaptive CPU-aware sleep, cached timestamps
- **Resiliencia**: SAFE_MODE com backoff exponencial + jitter, fail-closed (SecurityDegraded), recovery-only jobs, EventLog registration, mutex release em trap
- **Edge Event Aggregation**: deduplicacao local com janelas configuraveis, burst detection
- **Auto-update**: force update via heartbeat, Base64 decode + SHA256 validation
- **Integridade**: `$Global:BootScriptHash` como referencia, `Test-RuntimeIntegrity` cada 5 min

**Classificacao de complexidade: MUITO ALTA**

Justificativa: Este agente nao e um script de coleta simples. Ele implementa uma FSM completa, cadeia criptografica dupla (HMAC + ECDSA), auto-healing, deteccao heuristica, agregacao de eventos local, safe mode com degradacao controlada, e anti-tamper real. Isso e codigo de produto EDR, nao um wrapper de scripts.

### Agentes Linux/macOS v5.0.15 (~2.270 linhas cada)

- Paridade funcional com Windows (27 job types)
- Bash puro (sem dependencias externas alem de jq/curl)
- Mesmo heartbeat HMAC, mesmos handlers
- Performance tuning (log buffering, O(1) lookups, cached timestamps)
- Dynamic intervals do servidor

**Classificacao: ALTA** (menor que Windows por ausencia de anti-debug, ACL hardening, e FSM formal)

### DNS Filter (Go)

- Servico Windows (service_windows.go)
- DNS proxy com policy-based blocking
- Fsnotify para hot-reload de policies
- Structured logging
- ~930 linhas

**Classificacao: MEDIA** (componente auxiliar, mas produtizado)

---

## Etapa 4 -- Seguranca Aplicada Real

### O que REALMENTE existe no codigo

| Controle | Status | Evidencia |
|----------|--------|-----------|
| HMAC-SHA256 | Implementado | `_shared/hmac.ts` (443 linhas), timing-safe via `crypto-utils.ts` |
| Clock skew tolerance | Implementado | hmac.ts: `skewSeconds`, `maxSkewSeconds`, `serverTimeMs` |
| JWT validation | Implementado | `serve-tenant.ts` linha 202-212 |
| Tenant isolation (RLS) | Implementado | 1004 migrations, ESLint plugin custom |
| Token hashing | Implementado | `_shared/token-hash.ts` |
| ECDSA verification | Implementado | `_shared/verify-result-signature.ts` |
| Ed25519 (releases) | Implementado | agent v5 code, `sign-release` function |
| timingSafeEqual | Implementado | `_shared/crypto-utils.ts`, usado em serve-tenant.ts |
| Rate limiting | Implementado | `_shared/rate-limit.ts` + RPC atomico |
| IP allowlist | Implementado | `_shared/ip-allowlist.ts` |
| Secrets em arquivo (agente) | Implementado | agent v5: `C:\CyberShield\secrets\` |
| Anti-replay (nonce/timestamp) | Parcial | HMAC tem timestamp window, mas nonce tracking nao comprovado |
| Security headers | Implementado | `_shared/security-headers.ts` |
| Structured logging | Implementado | `_shared/logger.ts` com requestId |
| Sanitizacao | Implementado | `_shared/sanitize.ts`, `ai-sanitizer.ts` |
| Zod validation | Parcial | Presente em ~50% das funcoes migradas |
| `dangerouslySetInnerHTML` | **Nenhum uso** | chart.tsx menciona apenas em comentario |
| `Invoke-Expression` | **Eliminado** | reinstall scripts usam download-verify-execute |
| `@ts-ignore` | **Zero** ocorrencias |

### Debitos de Seguranca (comprovados)

| Debito | Evidencia | Impacto |
|--------|-----------|---------|
| `as any` no frontend | 421 ocorrencias em 38 arquivos | Medio (maioria em testes e type gaps) |
| 88 funcoes sem middleware padronizado | grep Deno.serve vs middleware | Alto (superficie inconsistente) |
| Nonce/replay tracking incompleto | HMAC tem timestamp window mas sem nonce table | Medio |

---

## Etapa 5 -- Qualidade e Maturidade do Codigo

### Metricas Objetivas

| Metrica | Valor | Avaliacao |
|---------|-------|-----------|
| `as any` | 421 (38 arquivos) | Ruim (mas caindo; era ~996) |
| `@ts-ignore` | 0 | Excelente |
| `console.log/error/warn` no src/ | 52 (5 arquivos, maioria no logger e test setup) | Bom |
| `Deno.serve()` sem middleware | ~88 funcoes | Medio (26 justificadas por HMAC) |
| Funcoes >1000 linhas | ~3 (autonomous-safe-mode 1476, action-center-feed 1318, evaluate-automation-rules 1057) | Ruim |
| Agente Windows | 7184 linhas (1 arquivo) | God Script, mas funcional |
| E2E specs | 64 | Bom |
| Unit tests (domain) | 15 | Adequado |
| Hook tests | 10 | Minimo |
| Edge function tests | 17 | Minimo para 259 funcoes |
| CI workflows | 13 | Maduro |
| Migrations | 1004 | Alta maturidade de esquema |

### Arquitetura de Dominio

O frontend implementa DDD parcial:
- **Entities**: Agent, Job, JobExecution, ComplianceScore, VulnerabilityScan, etc. (21 classes com value objects e factory methods)
- **Ports**: CryptoPort, com interface limpa
- **Services**: CryptoService, SoarEngine, ComplianceScoreCalculator, PatchOrchestrator, NotificationService
- **Value Objects**: presentes em `src/domain/value-objects/`
- **Events**: `src/domain/events/`

Isso nao e CRUD. Existe modelagem de dominio real com Result types e validacao.

### 20 Maiores Hotspots Tecnicos

1. `autonomous-safe-mode/index.ts` (1476 linhas, god function)
2. `action-center-feed/index.ts` (1318 linhas, god function)
3. `evaluate-automation-rules/index.ts` (1057 linhas, god function)
4. `cybershield-agent-windows-v5.ps1` (7184 linhas, god script)
5. `serve-installer/index.ts` (880 linhas)
6. `execute-playbook-action/index.ts` (853 linhas)
7. `ai-system-analyzer/index.ts` (833 linhas)
8. `heartbeat/index.ts` (789 linhas, mas justificado)
9. `ai-full-audit/index.ts` (783 linhas)
10. `hmac.ts` (443 linhas, mas critico de seguranca)
11. `serve-tenant.ts` (442 linhas, middleware core)
12. 88 funcoes sem middleware padronizado
13. 421 `as any` casts
14. 1004 migrations (acumulacao sem squash)
15. `cybershield-agent-linux-v5.sh` (2294 linhas)
16. `cybershield-agent-macos-v5.sh` (2247 linhas)
17. `dlq.ts` (269 linhas, mas operacional)
18. 37 hooks com refetchInterval (potencial polling storm)
19. ESLint plugin custom (manutenivel mas nicho)
20. DNS filter Go (componente separado com build proprio)

---

## Etapa 6 -- Classificacao do Que Gera Valor

### 1. COMMODITY (facil de reproduzir)

| Item | Esforco | % do Total |
|------|---------|-----------|
| CRUD de tenants/usuarios/membros | 2-3 semanas | ~5% |
| Login/signup/forgot password | 1 semana | ~2% |
| Paginas admin basicas (listagens) | 3-4 semanas | ~8% |
| Integracao Stripe basica | 2 semanas | ~3% |
| Landing page | 1 semana | ~1% |
| **Subtotal** | | **~19%** |

### 2. COMPLEXIDADE DE PRODUTO (exige design e dominio)

| Item | Esforco | Dificuldade |
|------|---------|------------|
| Engine de Jobs (create/poll/ack/submit/DLQ/retry/SLA) | 3-4 meses | Alta |
| SOAR Engine (playbooks, triggers, rules, actions) | 2-3 meses | Alta |
| Action Center (feed, correlacao, triage) | 2 meses | Alta |
| AI Router (16 handlers, multi-provider, circuit breaker) | 2-3 meses | Alta |
| Compliance Engine (SOC2, benchmarks, reports) | 2 meses | Alta |
| Risk Score Calculator | 1 mes | Media |
| 140+ hooks React com adaptive polling | 2-3 meses | Alta |
| 113 paginas admin com dashboards | 3-4 meses | Media-Alta |
| Enrollment flow completo | 1 mes | Media |
| DNS Filter (Go) | 1 mes | Media |
| Electron wrapper | 1 semana | Baixa |
| **Subtotal** | | **~35%** |

### 3. COMPLEXIDADE DE SEGURANCA (hardening, trust chain)

| Item | Esforco | Risco de Reconstrucao |
|------|---------|----------------------|
| HMAC-SHA256 com clock skew recovery | 2-3 meses | Muito Alto |
| ECDSA/RSA signature chain (agente-backend) | 2-3 meses | Muito Alto |
| Ed25519 release signing | 1 mes | Alto |
| RLS completo (1004 migrations) | 3-4 meses | Muito Alto |
| Multi-tenant isolation (ESLint plugin + middleware) | 2 meses | Alto |
| Token hashing + rotation | 1 mes | Alto |
| Rate limiting atomico | 1 mes | Medio |
| Secrets storage seguro (agente) | 2 semanas | Medio |
| Anti-tamper/anti-debug (agente) | 1 mes | Alto |
| TOCTOU self-healing | 1 mes | Alto |
| Security headers + CORS | 1 semana | Baixo |
| IP allowlist | 1 semana | Baixo |
| **Subtotal** | | **~25%** |

### 4. COMPLEXIDADE OPERACIONAL (observabilidade, resiliencia)

| Item | Esforco | Impacto |
|------|---------|---------|
| Dead-letter queue com backoff + jitter | 1 mes | Alto |
| KV cache | 2 semanas | Medio |
| Feature flags por tenant | 2 semanas | Medio |
| Structured logging com requestId | 1 mes | Alto |
| 13 workflows CI/CD | 2 meses | Alto |
| SQL security gates (CI) | 1 mes | Alto |
| Agent sync validation (CI) | 2 semanas | Medio |
| FSM do agente (RUNNING/DEGRADED/SAFE_MODE) | 1 mes | Alto |
| Edge event aggregation (agente) | 1 mes | Alto |
| Adaptive polling (frontend) | 2 semanas | Medio |
| 64 specs E2E | 2 meses | Alto |
| 130+ documentos | 1-2 meses | Medio |
| **Subtotal** | | **~21%** |

---

## Etapa 7 -- Custo Real de Replicacao no Brasil

### Perfis e Custos Mensais (CLT + encargos, 2026 Brasil)

| Perfil | Senioridade | Custo/mes (R$) |
|--------|-------------|---------------|
| Tech Lead / Arquiteto | Senior++ | 35.000 - 45.000 |
| Backend Engineer | Senior | 22.000 - 30.000 |
| Frontend Engineer | Senior | 20.000 - 28.000 |
| Security Engineer | Senior | 28.000 - 38.000 |
| Agent/Systems Engineer | Senior | 25.000 - 35.000 |
| DevOps/SRE | Senior | 22.000 - 30.000 |
| QA Engineer | Pleno-Senior | 15.000 - 22.000 |
| Product Manager | Senior | 20.000 - 28.000 |

### Cenario 1: MVP Funcional

**Escopo**: Frontend basico, 30 edge functions core, agente Windows simples (sem ECDSA/HMAC), enrollment, heartbeat, 5 tipos de job, dashboard basico, auth, multi-tenant basico.

| Time | Qtd | Duracao | Custo |
|------|-----|---------|-------|
| Tech Lead | 1 | 6 meses | R$ 240.000 |
| Backend Sr | 2 | 6 meses | R$ 312.000 |
| Frontend Sr | 1 | 6 meses | R$ 156.000 |
| Agent Engineer | 1 | 6 meses | R$ 180.000 |
| DevOps | 0.5 | 6 meses | R$ 78.000 |
| **Subtotal equipe** | | | **R$ 966.000** |
| Infra (Supabase + CI) | | 6 meses | R$ 30.000 |
| **TOTAL MVP** | | **6 meses** | **~R$ 1.000.000** |
| | | | **~US$ 175.000** |

**Risco**: MVP nao tera seguranca real. Nenhum HMAC, nenhum ECDSA, RLS parcial. Inutilizavel para enterprise/compliance.

### Cenario 2: Versao Comparavel a Atual

**Escopo**: 259 edge functions, agente Windows completo (7k linhas), agentes Linux/macOS, DNS filter, HMAC + ECDSA, RLS completo, 113 paginas admin, 140 hooks, SOAR engine, AI router, compliance, 64 E2E specs, 13 workflows CI.

| Time | Qtd | Duracao | Custo |
|------|-----|---------|-------|
| Tech Lead/Arquiteto | 1 | 18 meses | R$ 720.000 |
| Backend Sr | 3 | 18 meses | R$ 1.296.000 |
| Frontend Sr | 2 | 18 meses | R$ 864.000 |
| Security Engineer | 1 | 18 meses | R$ 576.000 |
| Agent/Systems Engineer | 2 | 18 meses | R$ 1.080.000 |
| DevOps/SRE | 1 | 18 meses | R$ 432.000 |
| QA Engineer | 1 | 12 meses | R$ 216.000 |
| Product Manager | 1 | 18 meses | R$ 432.000 |
| **Subtotal equipe** | **12 pessoas** | | **R$ 5.616.000** |
| Infra | | 18 meses | R$ 108.000 |
| Ferramentas/licencas | | 18 meses | R$ 54.000 |
| **TOTAL** | | **18 meses** | **~R$ 5.780.000** |
| | | | **~US$ 1.010.000** |

### Cenario 3: Versao Madura e Auditavel (SOC 2 ready)

**Escopo**: Tudo do cenario 2 + pen test real, cobertura de testes >60%, zero `as any`, documentation review, compliance artifacts, 90-day key rotation comprovada, incident response testada, load testing, security audit formal.

| Time | Qtd | Duracao | Custo |
|------|-----|---------|-------|
| Time completo (12 pessoas) | 12 | 24 meses | R$ 7.488.000 |
| Pen test externo | 1 | pontual | R$ 80.000 |
| Auditoria SOC 2 | 1 | 6 meses | R$ 200.000 |
| Infra + ferramentas | | 24 meses | R$ 240.000 |
| Contingencia (20%) | | | R$ 1.601.600 |
| **TOTAL** | | **24 meses** | **~R$ 9.610.000** |
| | | | **~US$ 1.680.000** |

### Riscos que Podem Estourar Orcamento

1. **Agente Windows**: Complexidade subestimada -- FSM, ECDSA, anti-tamper, TOCTOU, safe mode, 27 job types. Sozinho pode consumir 30% do budget.
2. **1004 migrations**: Recriar o esquema de banco com RLS completo e exige deep expertise em PostgreSQL + Supabase.
3. **Cadeia criptografica**: HMAC + ECDSA + Ed25519 + clock skew + timing-safe. Errar qualquer peca compromete tudo.
4. **Paridade de agentes**: Manter Windows/Linux/macOS com mesma feature set multiplica esforco por 2.5x.

---

## Etapa 8 -- Conclusao Executiva

### Custo Total Estimado de Replicacao no Brasil

| Cenario | Valor (R$) | Valor (US$) | Prazo |
|---------|-----------|-------------|-------|
| MVP | ~R$ 1.000.000 | ~US$ 175.000 | 6 meses |
| Comparavel | ~R$ 5.780.000 | ~US$ 1.010.000 | 18 meses |
| Madura | ~R$ 9.610.000 | ~US$ 1.680.000 | 24 meses |

**Intervalo realista**: **R$ 5.000.000 -- R$ 10.000.000** (US$ 875K -- US$ 1.75M)

### Distribuicao de Valor por Componente

| Componente | % do Valor | Justificativa |
|-----------|-----------|---------------|
| **Agente endpoint** (Win+Lin+Mac) | **35%** | 11.725 linhas, FSM, crypto chain, 27 job types, anti-tamper, safe mode |
| **Backend/Edge Functions** | **25%** | 259 funcoes, middleware padronizado, SOAR, DLQ, AI router |
| **Seguranca aplicada** | **20%** | HMAC, ECDSA, Ed25519, RLS (1004 migrations), timing-safe, token rotation |
| **Frontend/Dashboards** | **10%** | 113 paginas, 140 hooks, adaptive polling |
| **Operacional** (CI, testes, docs) | **10%** | 13 workflows, 64 E2E, 130+ docs, security gates |

### Principais Drivers de Custo

1. **Cadeia criptografica do agente** -- a parte mais cara e arriscada de reconstruir
2. **RLS e isolamento multi-tenant** -- 1004 migrations refletem iteracao real de schema
3. **259 edge functions** -- mesmo com redundancia, representam cobertura funcional ampla
4. **Agente multiplataforma** -- manter paridade Win/Lin/Mac e multiplicador de custo

### Parte Mais Subestimada por Compradores Leigos

**A operacionalizacao**: DLQ, retries com backoff, feature flags, structured logging, CI gates de seguranca, ESLint plugin custom, agent sync validation, 64 E2E specs. Isso nao aparece em demo mas e o que separa "funciona na minha maquina" de "funciona em producao com 1000 agentes".

### Tempo de Trabalho Acumulado (Estimativa Forense)

Baseado na densidade de codigo, numero de migrations (1004), commits implicitos (18.578 workflow runs mencionados), e maturidade dos componentes:

**Estimativa: 18 a 30 meses de trabalho de equipe**

Justificativa:
- 1004 migrations indicam iteracao continua de esquema
- 7184 linhas de agente Windows com 15+ versoes documentadas no header
- Primeira migration: outubro 2025, mais recente: marco 2026 (~6 meses)
- Mas a densidade funcional sugere trabalho acelerado (possivelmente assistido por IA)
- O volume de 18.578 workflow runs em 6 meses indica cadencia muito alta de deploys

**Conclusao**: O codigo atual representa o equivalente a 18-30 meses de trabalho convencional comprimidos em ~6 meses, provavelmente com assistencia de IA significativa. O valor esta na arquitetura implementada e na maturidade operacional, nao no tempo cronologico.

### Divergencias entre Discurso e Implementacao

| Afirmacao | Realidade no Codigo |
|-----------|-------------------|
| "Nonce/replay protection" | Timestamp window existe no HMAC, mas nao ha tabela de nonces consumidos |
| "Circuit breaker" | AI circuit breaker existe (`ai-circuit-breaker.ts`), mas nao e generico |
| "Cobertura de testes >60%" | Real: ~15 unit tests + 64 E2E + 17 edge. Cobertura real provavelmente <20% |
| "Zero as any" | 421 ocorrencias (caindo de ~996, mas longe de zero) |
| "58 funcoes sem auth" | Na verdade sao ~88 |

**Veredicto final**: O sistema e real, funcional e substancial. Nao e vaporware. A complexidade do agente, a cadeia criptografica e a infraestrutura de middleware sao diferenciais genuinos. Os debitos tecnicos existem mas sao tipicos de software em iteracao rapida. O custo de replicacao e significativo -- principalmente pela seguranca aplicada e pelo agente endpoint, que sao as partes que nenhum framework ou biblioteca resolve por voce.

---

# Plano de Correção — 3 Bugs Críticos do Agente v5.0.15

**Data:** 2026-03-29
**Origem:** Análise forense de logs de produção (pcteste1)

## Resumo Executivo

| # | Problema | Severidade | Estado Atual | Correção |
|---|----------|-----------|--------------|----------|
| P1 | TOCTOU violation recorrente → agent termination | **CRÍTICO** | Hotfix parcial (self-heal funciona para cache stale, mas falha para BOM/update race) | 4 correções no script |
| P2 | Falha ECDSA no boot → DEGRADED temporário | **ALTO** | Hotfix v5.0.15-keygen-v2 (dry-run ECDsaCng) já implementado, mas boot ainda mostra DEGRADED | 2 correções no script |
| P3 | Baseline de processos corrompendo (duplicate key) | **MÉDIO** | Hotfix v5.0.15-baseline (Get-SafeBaselineProp + ConvertTo-SafePSO) já implementado, mas erro persiste | 3 correções no script |

## Arquivo Único Afetado

`supabase/functions/_shared/agent-scripts/cybershield-agent-windows-v5.ps1` (7.184 linhas)
+ sync para `public/agent-scripts/cybershield-agent-windows-v5.ps1`

---

## P1 — TOCTOU Violation Recorrente (CRÍTICO)

### Evidência no Log
```
[INTEGRITY] RUNTIME TOCTOU VIOLATION: Script modified while running!
Boot: acb30b..., Now: 19e4be24...
TOCTOU VIOLATION DETECTED - terminating agent immediately
```
Ocorre repetidamente entre 24-29 de março, causando crash-loop com restart a cada poucos minutos.

### Análise do Código Atual (linhas 814-888)

O mecanismo `Test-RuntimeIntegrity` funciona assim:
1. Lê hash esperado do cache JSON/TXT
2. Computa `Get-FileHash` do arquivo em disco
3. Se diferem → compara com `$Global:BootScriptHash`
4. Se `currentHash == BootScriptHash` → self-heal (cache stale)
5. Se `currentHash != BootScriptHash` → verifica `$Global:UpdateInProgress`
6. Se não está em update → **TOCTOU VIOLATION → termina agente**

### Causa Raiz Identificada

**Hipótese principal: Divergência de encoding/BOM durante auto-update.**

O fluxo de auto-update salva o novo script com encoding possivelmente diferente (UTF-8 com BOM vs sem BOM). O `Get-FileHash` do PowerShell computa hash sobre os bytes brutos, incluindo BOM. Quando o agente reinicia após update:
- `$Global:BootScriptHash` = hash com BOM (novo arquivo)
- Cache `expected_script_hash.json` = hash sem BOM (computado pelo servidor)
- Self-heal atualiza cache para match → OK no boot

Mas se outro processo (AV, deploy, sync) reescreve o arquivo com BOM diferente durante a execução, `currentHash` muda e ≠ `BootScriptHash` → TOCTOU violation real ou falso positivo.

### Correções (4 mudanças)

#### P1.1 — Hash BOM-safe em Test-RuntimeIntegrity
**Linha 841** — Substituir `Get-FileHash` por leitura raw com strip de BOM:

```powershell
# ANTES:
$currentHash = (Get-FileHash -Path $PSCommandPath -Algorithm SHA256).Hash.ToLower()

# DEPOIS:
$scriptBytes = [System.IO.File]::ReadAllBytes($PSCommandPath)
if ($scriptBytes.Length -ge 3 -and $scriptBytes[0] -eq 0xEF -and $scriptBytes[1] -eq 0xBB -and $scriptBytes[2] -eq 0xBF) {
    $scriptBytes = $scriptBytes[3..($scriptBytes.Length - 1)]
}
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hashBytes = $sha256.ComputeHash($scriptBytes)
$currentHash = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
$sha256.Dispose()
```

Aplicar a **mesma normalização** em:
- `$Global:BootScriptHash` (linha 553)
- Boot hash validation (linhas 385, 405, 436)
- Qualquer outro ponto que compute hash do script

#### P1.2 — Grace period pós-update
**Após o bloco UpdateInProgress (linha 876)** — Adicionar:

```powershell
# Grace period: skip TOCTOU check for 30s after update completes
if ($Global:UpdateCompletedAt -and ((Get-Date) - $Global:UpdateCompletedAt).TotalSeconds -lt 30) {
    Write-Log "[INTEGRITY] Post-update grace period active - skipping TOCTOU check" "DEBUG"
    return $true
}
```

E no fluxo de auto-update, setar `$Global:UpdateCompletedAt = Get-Date` quando `UpdateInProgress` volta a `$false`.

#### P1.3 — Atomic update (download-verify-rename)
No fluxo de auto-update do agente, garantir que:
1. Novo script é baixado para `$BaseDir\cybershield-agent-update.tmp`
2. Hash SHA-256 é validado contra o esperado
3. `$Global:UpdateInProgress = $true`
4. `Move-Item -Path $tmpPath -Destination $PSCommandPath -Force` (atômico em NTFS)
5. `$Global:UpdateInProgress = $false; $Global:UpdateCompletedAt = Get-Date`

Verificar se o código atual já faz isso ou se escreve diretamente.

#### P1.4 — Log estruturado para diagnóstico
Adicionar ao `else` de TOCTOU violation (linha 878):

```powershell
Write-Log "[INTEGRITY] TOCTOU details: BootHash=$($Global:BootScriptHash.Substring(0,16)), CurrentHash=$($currentHash.Substring(0,16)), CacheHash=$($expectedHash.Substring(0,16)), UpdateInProgress=$($Global:UpdateInProgress), UpdateCompletedAt=$($Global:UpdateCompletedAt)" "ERROR"
```

---

## P2 — Falha Criptográfica no Boot (ALTO)

### Evidência no Log
```
[BOOT] No signing key available after Initialize-AgentKeys. Attempting RSA-2048 emergency generation...
[BOOT] RSA-2048-CSP emergency key generated and persisted. Signing ready.
[KEYS] Loaded existing keypair (RSA-2048-XML, version: 56)
[FSM] State transition: INITIALIZING -> AUTHENTICATING
```

### Análise do Código Atual (linhas 1557-1693)

O hotfix v5.0.15-keygen-v2 está correto em sua lógica:
1. Tenta instanciar `ECDsaCng(256)` e chamar `ExportPkcs8PrivateKey()`
2. Se falha → `$canExportPkcs8 = $false`
3. Se `$false` → chama `Initialize-RSACspKeys` diretamente

**Mas** o log mostra que o agente ainda entra em estado "No signing key available after Initialize-AgentKeys", o que significa que o caller de `Initialize-AgentKeys` recebe `$false` ou `$null` **antes** do fallback RSA completar.

### Causa Raiz Provável

O caller (provavelmente no bloco de boot/FSM) chama `Initialize-AgentKeys` e verifica `$Global:AgentPrivateKey` imediatamente. Se o dry-run ECDSA **throw** (em vez de falhar silenciosamente), o `try/catch` externo (linha 1565) captura e retorna `$false` **sem** chamar `Initialize-RSACspKeys`.

Verificação necessária: o `catch` em linha 1587-1599 pode lançar exceção não capturada se `ECDsaCng::new(256)` falhar de forma inesperada.

### Correções (2 mudanças)

#### P2.1 — Fallback RSA no catch externo
**Linha 4303-4308 equivalente no Initialize-AgentKeys** — Garantir que o `catch` externo (linha equivalente) chama `Initialize-RSACspKeys`:

```powershell
# No catch externo de Initialize-AgentKeys:
} catch {
    Write-Log "[KEYS] Key initialization error: $($_.Exception.Message) - attempting RSA fallback" "WARN"
    try {
        return Initialize-RSACspKeys
    } catch {
        Write-Log "[KEYS] RSA fallback also failed: $($_.Exception.Message)" "ERROR"
        return $false
    }
}
```

#### P2.2 — Eliminar "emergency generation" duplicada no caller
Localizar o código que faz "Attempting RSA-2048 emergency generation" (provável no boot sequence). Esse código é redundante se `Initialize-AgentKeys` já faz o fallback. Unificar para que exista **um único path** para geração de chaves RSA.

---

## P3 — Baseline de Processos Corrompendo (MÉDIO)

### Evidência no Log
```
[BASELINE] Failed to detect process anomalies: O item já foi adicionado. Chave contida no dicionário: 'name'
[BASELINE] Corrupted baseline detected (duplicate key). Rebuilding baseline...
[BASELINE] Created baseline with 65 processes
```

### Análise do Código Atual (linhas 4202-4438)

O código tem 3 camadas de proteção:
1. `Get-SafeBaselineProp` — acesso seguro via `PSObject.Properties.Match()`
2. `ConvertTo-SafePSO` — conversão para PSCustomObject limpo
3. Dedup no load e no save via `HashSet<string>`

**Mas o erro persiste.** A exceção "O item já foi adicionado" ocorre em **ConvertFrom-Json** (PS 5.1), não no código de acesso. O `ConvertFrom-Json` do PS 5.1 cria um PSCustomObject com NoteProperties, e se o JSON tem chaves duplicadas, ele tenta adicionar a mesma NoteProperty duas vezes → crash.

### Causa Raiz

O JSON salvo pode ter chaves duplicadas dentro de um mesmo objeto. Isso acontece quando:
1. `ConvertTo-Json` serializa um `[ordered]@{}` que foi convertido para PSCustomObject com propriedades duplicadas
2. Ou quando o arquivo é corrompido por escrita concorrente (dois ciclos de baseline rodando simultaneamente)

### Correções (3 mudanças)

#### P3.1 — Serialização manual (bypass ConvertTo-Json)
Criar `ConvertTo-BaselineJson` que produz JSON sem depender de `ConvertTo-Json`:

```powershell
function ConvertTo-BaselineJson {
    param([array]$Baseline)
    $sb = [System.Text.StringBuilder]::new(4096)
    [void]$sb.Append('[')
    $first = $true
    foreach ($e in $Baseline) {
        if (-not $first) { [void]$sb.Append(',') }
        $first = $false
        $n = ((Get-SafeBaselineProp $e 'name') -replace '\\', '\\\\' -replace '"', '\"')
        $c = ((Get-SafeBaselineProp $e 'company') -replace '\\', '\\\\' -replace '"', '\"')
        $d = ((Get-SafeBaselineProp $e 'description') -replace '\\', '\\\\' -replace '"', '\"')
        $f = ((Get-SafeBaselineProp $e 'first_seen') -replace '\\', '\\\\' -replace '"', '\"')
        [void]$sb.Append("{`"name`":`"$n`",`"company`":")
        if ($c) { [void]$sb.Append("`"$c`"") } else { [void]$sb.Append("null") }
        [void]$sb.Append(",`"description`":")
        if ($d) { [void]$sb.Append("`"$d`"") } else { [void]$sb.Append("null") }
        [void]$sb.Append(",`"first_seen`":`"$f`"}")
    }
    [void]$sb.Append(']')
    return $sb.ToString()
}
```

Substituir **todas** as chamadas `ConvertTo-SafePSO | ConvertTo-Json -Depth 5` por `ConvertTo-BaselineJson`.

#### P3.2 — Leitura resiliente (bypass ConvertFrom-Json para baseline)
Wrap `ConvertFrom-Json` com fallback regex:

```powershell
function Import-BaselineSafe {
    param([string]$RawJson)
    $entries = @()
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    try {
        $parsed = $RawJson | ConvertFrom-Json -ErrorAction Stop
        foreach ($item in $parsed) {
            $name = Get-SafeBaselineProp $item 'name'
            if ($name -and -not $seen.Contains($name)) {
                [void]$seen.Add($name)
                $entries += [ordered]@{
                    name = $name
                    company = Get-SafeBaselineProp $item 'company'
                    description = Get-SafeBaselineProp $item 'description'
                    first_seen = Get-SafeBaselineProp $item 'first_seen'
                }
            }
        }
    } catch {
        Write-Log "[BASELINE] ConvertFrom-Json failed, using regex recovery: $($_.Exception.Message)" "WARN"
        $nameMatches = [regex]::Matches($RawJson, '"name"\s*:\s*"([^"]*)"')
        foreach ($m in $nameMatches) {
            $name = $m.Groups[1].Value
            if ($name -and -not $seen.Contains($name)) {
                [void]$seen.Add($name)
                $entries += [ordered]@{ name = $name; company = $null; description = "recovered"; first_seen = (Get-Date).ToString("o") }
            }
        }
    }
    return $entries
}
```

#### P3.3 — Mutex para escrita de baseline
Prevenir escrita concorrente:

```powershell
$baselineMutex = [System.Threading.Mutex]::new($false, "CyberShield_Baseline_Write")
try {
    [void]$baselineMutex.WaitOne(5000)
    $jsonContent = ConvertTo-BaselineJson -Baseline $Global:ProcessBaseline
    [System.IO.File]::WriteAllText($Global:ProcessBaselinePath, $jsonContent, [System.Text.UTF8Encoding]::new($false))
} finally {
    $baselineMutex.ReleaseMutex()
}
```

---

## ✅ Etapas 1-4 Concluídas (Agent v5.0.15 consolidado)

Todas as correções P1 (TOCTOU), P2 (crypto boot) e P3 (baseline) foram aplicadas
diretamente na v5.0.15. Scripts source e public sincronizados.

---

# ETAPA 5 — Plano de Mitigação de Débitos Técnicos e Conformidade SOC 2

**Data do plano:** 2026-03-29
**Baseline verificada em código (não estimada):**

| Métrica | Valor Real Verificado |
|---------|----------------------|
| `as any` casts em `src/` | **89** (em ~25 arquivos, maioria em testes) |
| God functions >1000 linhas | **3** (autonomous-safe-mode: 1451, action-center-feed: 1315, evaluate-automation-rules: 1058) |
| `refetchInterval` em `src/` | **148** ocorrências |
| Arquivos de teste (src + edge) | **74** (55 src + 19 edge) |
| Tabela de nonces/replay | **Não existe** |
| Tabelas de aprovação (dual-admin) | **5 tabelas existem** (automation_approvals, approvals, approval_chains, approval_requests, v_pending_critical_approvals) |
| backup_verifications | **Existe** |
| agent_signing_keys | **Existe** |

---

## FASE 1 — IMPACTO DIRETO SOC 2 (Semanas 1-2)

### 1.1 Nonce/Replay Tracking (Item #5) — P1 CRÍTICO
**Severidade:** Alta (sem isso, HMAC é vulnerável a replay attacks)
**Esforço:** 2 dias
**Impacto SOC 2:** CC6.1 (Logical Access), CC6.6 (External Threats)

**Ações:**
1. **Criar tabela `hmac_consumed_nonces`:**
   ```sql
   CREATE TABLE public.hmac_consumed_nonces (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     nonce text NOT NULL,
     agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
     tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     consumed_at timestamptz NOT NULL DEFAULT now(),
     expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
     UNIQUE(nonce, tenant_id)
   );
   CREATE INDEX idx_nonces_expires ON hmac_consumed_nonces(expires_at);
   CREATE INDEX idx_nonces_lookup ON hmac_consumed_nonces(nonce, tenant_id);
   ALTER TABLE hmac_consumed_nonces ENABLE ROW LEVEL SECURITY;
   ```

2. **Criar cron job de limpeza (a cada 15 min):**
   ```sql
   SELECT cron.schedule('cleanup-expired-nonces', '*/15 * * * *', $$
     DELETE FROM public.hmac_consumed_nonces WHERE expires_at < now();
   $$);
   ```

3. **Modificar `_shared/hmac.ts`:**
   - Antes de validar HMAC, verificar se nonce já foi consumido
   - Após validação bem-sucedida, inserir nonce na tabela
   - Rejeitar com 409 Conflict se nonce já existir

4. **Atualizar agente v5.0.15:**
   - Gerar UUID como nonce em cada request
   - Incluir nonce no cálculo HMAC: `HMAC(timestamp + nonce + body)`

**Critério de sucesso:** Zero replay attacks possíveis; nonce rejeitado na segunda tentativa.

---

### 1.2 Evidência Formal de Restore Tests — CC7.5 (Item #8) — P1
**Severidade:** Alta (bloqueador de certificação)
**Esforço:** 1 dia
**Impacto SOC 2:** CC7.5 (Recovery Testing)

**Ações:**
1. **Criar cron job semanal** que executa `scripts/backup-restore-test.sh` automaticamente
2. **Verificar e popular `backup_verifications`:**
   ```sql
   -- Cron semanal (domingos 03:00 UTC)
   SELECT cron.schedule('weekly-backup-restore-test', '0 3 * * 0', $$
     SELECT net.http_post(
       url:='https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/run-backup-restore-test',
       headers:='{"Authorization": "Bearer <anon_key>"}'::jsonb
     );
   $$);
   ```
3. **Criar edge function `run-backup-restore-test`** que:
   - Executa restore em schema temporário
   - Valida integridade da cadeia de auditoria
   - Insere resultado em `backup_verifications`
   - Envia alerta se falhar
4. **Dashboard de evidência:** Adicionar card em ComplianceDashboard mostrando últimas 10 verificações

**Critério de sucesso:** Registro semanal em `backup_verifications` com resultado pass/fail + timestamp.

---

### 1.3 Comprovar Rotação de Chaves 90 dias (Item #9) — P1
**Severidade:** Alta (bloqueador de certificação)
**Esforço:** 1 dia
**Impacto SOC 2:** CC6.1, CC6.7 (Key Management)

**Ações:**
1. **Criar cron job de rotação automática (mensal, verificação de 90 dias):**
   ```sql
   SELECT cron.schedule('check-key-rotation', '0 2 1 * *', $$
     SELECT net.http_post(
       url:='https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/rotate-signing-keys',
       headers:='{"Authorization": "Bearer <anon_key>"}'::jsonb
     );
   $$);
   ```
2. **Criar tabela `key_rotation_audit_log`:**
   ```sql
   CREATE TABLE public.key_rotation_audit_log (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id uuid REFERENCES tenants(id),
     key_type text NOT NULL, -- 'ed25519_signing', 'hmac_agent', 'ecdsa_agent'
     old_key_id uuid,
     new_key_id uuid,
     rotated_at timestamptz NOT NULL DEFAULT now(),
     rotated_by text NOT NULL DEFAULT 'system_cron',
     reason text DEFAULT 'scheduled_90_day_rotation'
   );
   ```
3. **Verificar `agent_signing_keys`:** Adicionar alerta se alguma chave tem >80 dias sem rotação
4. **Dashboard:** Card de "Key Rotation Status" mostrando dias desde última rotação por tipo

**Critério de sucesso:** Evidência de rotação automática a cada ≤90 dias com audit trail completo.

---

### 1.4 Workflow Dual-Admin (Item #6) — P2
**Severidade:** Média-Alta (parcialmente implementado)
**Esforço:** 3 dias
**Impacto SOC 2:** CC6.1 (Segregation of Duties), CC8.1 (Change Management)

**Estado atual:** 5 tabelas existem (approvals, approval_chains, approval_requests, automation_approvals, v_pending_critical_approvals). Falta UI completa e enforcement.

**Ações:**
1. **Mapear ações que requerem dual-approval:**
   - Deletar agente
   - Alterar política de segurança
   - Revogar chave de enrollment
   - Alterar configuração de tenant
   - Aprovar automação SOAR crítica
2. **Criar componente `ApprovalWorkflow`:**
   - Formulário de solicitação com justificativa
   - Lista de aprovações pendentes (filtrada por role)
   - Notificação em tempo real via Supabase Realtime
3. **Enforcement em Edge Functions:**
   - Interceptar ações críticas
   - Verificar se existe aprovação válida em `approval_requests`
   - Rejeitar com 403 se não aprovado por segundo admin
4. **Audit trail:** Toda aprovação/rejeição registrada com evidência (5 Ws)

**Critério de sucesso:** Ações críticas bloqueadas sem segunda aprovação; trail completo em approval_requests.

---

## FASE 2 — QUALIDADE DE CÓDIGO (Semanas 3-4)

### 2.1 Reduzir `as any` de 89 para <50 (Item #1) — P2
**Severidade:** Média
**Esforço:** 1-2 dias (já reduzido de 421 para 89)
**Impacto SOC 2:** CC8.1 (Quality Assurance)

**Estado atual:** 89 casts, maioria em arquivos de teste (useAuth.test.tsx: 11, useSuperAdmin.test.tsx: 7, useTenant.test.tsx: 5).

**Ações:**
1. **Testes (≈45 casts):** Criar tipos mock adequados:
   ```typescript
   // Em vez de: const mockSupabase = { auth: { getUser: vi.fn() } } as any
   // Usar:
   type MockSupabaseClient = Pick<SupabaseClient, 'auth'> & { auth: { getUser: Mock } };
   ```
2. **Hooks de produção (≈20 casts):** Tipar corretamente retornos de Supabase queries
3. **Páginas admin (≈24 casts):** Substituir por type assertions específicas (`as AgentRow`)

**Prioridade interna:**
| Grupo | Arquivos | Casts | Ação |
|-------|----------|-------|------|
| Testes | 8 arquivos | ~45 | Criar tipos mock |
| Hooks prod | 3 arquivos | ~12 | Tipar queries |
| Páginas | 8 arquivos | ~24 | Type assertions específicas |
| Infra | 6 arquivos | ~8 | Caso a caso |

**Critério de sucesso:** `grep -rn "as any" src/ | wc -l` retorna <50.

---

### 2.2 Decompor 3 God Functions (Item #2) — P2
**Severidade:** Média
**Esforço:** 2 dias
**Impacto SOC 2:** CC8.1 (Maintainability)

**Plano de decomposição:**

#### `autonomous-safe-mode/index.ts` (1451 linhas)
Dividir em:
- `_shared/safe-mode/health-checks.ts` — Verificações de saúde (agent connectivity, DB health)
- `_shared/safe-mode/recovery-actions.ts` — Ações de recuperação (restart, rollback)
- `_shared/safe-mode/escalation.ts` — Lógica de escalação (alertas, notificações)
- `autonomous-safe-mode/index.ts` — Orquestrador (≤300 linhas)

#### `action-center-feed/index.ts` (1315 linhas)
Dividir em:
- `_shared/action-center/feed-builder.ts` — Construção do feed de ações
- `_shared/action-center/filters.ts` — Filtros e paginação
- `_shared/action-center/enrichment.ts` — Enriquecimento de dados (agent info, tenant info)
- `action-center-feed/index.ts` — Handler HTTP (≤250 linhas)

#### `evaluate-automation-rules/index.ts` (1058 linhas)
Dividir em:
- `_shared/automation/rule-engine.ts` — Motor de avaliação de regras
- `_shared/automation/condition-evaluator.ts` — Avaliação de condições
- `_shared/automation/action-executor.ts` — Execução de ações
- `evaluate-automation-rules/index.ts` — Entry point (≤200 linhas)

**Critério de sucesso:** Nenhum arquivo >500 linhas; todos os testes existentes passando.

---

### 2.3 Auditoria de refetchInterval (Item #3) — P2
**Severidade:** Média
**Esforço:** 1 dia
**Impacto SOC 2:** Indireto (performance/disponibilidade)

**Estado atual:** 148 ocorrências de `refetchInterval` em `src/`.

**Ações:**
1. **Categorizar os 148 usos:**
   - **Substituir por Realtime** (tabelas com publicação ativa): agents, jobs, alerts, heartbeats
   - **Converter para useAdaptivePolling** (pausa em background): dashboards, monitoring
   - **Manter refetchInterval** (dados externos sem Realtime): config, policies
   - **Remover** (dados estáticos que não mudam): enums, feature flags

2. **Aplicar `usePageVisibility`:**
   ```typescript
   const isVisible = usePageVisibility();
   useQuery({
     refetchInterval: isVisible ? 30000 : false, // Pausa quando aba oculta
   });
   ```

3. **Padronizar intervalos:**
   | Tipo de dado | Intervalo | Com Realtime? |
   |-------------|-----------|---------------|
   | Agentes ativos | Realtime | Sim → remover polling |
   | Dashboard metrics | 60s (visible) / false (hidden) | Não |
   | Alertas | Realtime | Sim → remover polling |
   | Config/policies | 300s | Não |

**Critério de sucesso:** ≤30 `refetchInterval` restantes; zero polling em abas ocultas.

---

## FASE 3 — COBERTURA DE TESTES (Semanas 3-6)

### 3.1 Aumentar Cobertura de <20% para >60% (Item #4) — P1
**Severidade:** Alta (bloqueador SOC 2)
**Esforço:** 2-3 semanas
**Impacto SOC 2:** CC8.1 (Testing), CC7.1 (Monitoring)

**Estado atual:** 74 arquivos de teste (55 src + 19 edge functions).

**Estratégia por camada:**

#### Semana 1 — Edge Functions críticas (Tier 1-2)
| Função | Tipo | Prioridade |
|--------|------|-----------|
| heartbeat | Integration | P0 |
| poll-jobs | Integration | P0 |
| serve-agent-update | Integration | P0 |
| submit-agent-evidence | Integration | P0 |
| evaluate-automation-rules | Unit | P1 |
| action-center-feed | Unit | P1 |
| autonomous-safe-mode | Unit | P1 |

**Meta:** 30 novos testes de edge functions → cobertura edge: ~60%

#### Semana 2 — Hooks e services críticos
| Módulo | Tipo | Prioridade |
|--------|------|-----------|
| useAuth / useSession | Unit | P0 |
| useTenant / useTenantFeatures | Unit | P0 |
| useAgentActions | Unit | P1 |
| HMAC validation | Unit | P0 |
| Rate limiter | Unit | P0 |
| domain/services/* | Unit | P1 |

**Meta:** 25 novos testes de hooks/services → cobertura src: ~40%

#### Semana 3 — Componentes e páginas
| Módulo | Tipo | Prioridade |
|--------|------|-----------|
| AgentManagement | Integration | P1 |
| SecurityMonitoring | Integration | P1 |
| ComplianceDashboard | Integration | P1 |
| ApprovalWorkflow | Integration | P1 |
| Auth flow (login/signup) | E2E | P0 |

**Meta:** 20 novos testes → cobertura total: >60%

**Critério de sucesso:** `vitest --coverage` reporta ≥60% branches + statements.

---

## FASE 4 — VALIDAÇÃO EXTERNA (Semanas 5-8)

### 4.1 Pen Test Externo (Item #7) — P1
**Severidade:** Alta (bloqueador de certificação)
**Esforço:** 1-2 semanas (externo) + 1 semana remediação
**Impacto SOC 2:** CC3.1, CC6.1, CC7.1

**Ações:**
1. **Preparação (Semana 5):**
   - Documentar superfície de ataque (259 edge functions, 12 agent scripts, DNS filter)
   - Preparar ambiente de staging isolado
   - Definir escopo: OWASP Top 10, autenticação, HMAC/ECDSA, multi-tenant isolation
2. **Execução (Semanas 6-7):**
   - Contratar firma de pen test certificada (CREST/OSCP)
   - Escopo mínimo: API testing, authentication bypass, privilege escalation, tenant isolation
3. **Remediação (Semana 8):**
   - Classificar findings por severidade (Critical/High/Medium/Low)
   - Corrigir todos os Critical e High antes da certificação
   - Documentar Medium/Low com plano de mitigação

**Critério de sucesso:** Relatório de pen test com zero findings Critical/High não remediados.

---

### 4.2 Testes de Carga (Item #10) — P3
**Severidade:** Média-Baixa
**Esforço:** 3-5 dias
**Impacto SOC 2:** CC7.1 (Availability)

**Ações:**
1. **Definir cenários:**
   - 1000 agentes simultâneos com heartbeat a cada 60s
   - 100 heartbeats/segundo sustained
   - Burst: 500 alertas em 10 segundos
   - 50 usuários admin simultâneos no dashboard
2. **Ferramentas:** k6 ou Artillery
3. **Targets:**
   - heartbeat: p99 < 500ms
   - poll-jobs: p99 < 300ms
   - dashboard queries: p99 < 2s
4. **Executar e documentar resultados** em `docs/load-test-results/`

**Critério de sucesso:** Todos os endpoints dentro dos targets de latência sob carga.

---

## CRONOGRAMA CONSOLIDADO

```
Semana 1 (S1): [FASE 1] Nonce/replay + Restore evidence + Key rotation audit
Semana 2 (S2): [FASE 1] Dual-admin workflow (UI + enforcement)
Semana 3 (S3): [FASE 2] as any + god functions + refetchInterval audit
               [FASE 3] Testes edge functions (Tier 1-2)
Semana 4 (S4): [FASE 3] Testes hooks/services + componentes
Semana 5 (S5): [FASE 3] Completar cobertura 60%
               [FASE 4] Preparar pen test
Semana 6 (S6): [FASE 4] Pen test externo (execução)
Semana 7 (S7): [FASE 4] Pen test (continuação) + load test
Semana 8 (S8): [FASE 4] Remediação de findings + relatório final
```

## MATRIZ DE PRIORIDADE (MoSCoW)

| Item | Must | Should | Could | Won't |
|------|------|--------|-------|-------|
| #5 Nonce/replay | ✅ | | | |
| #8 Restore evidence | ✅ | | | |
| #9 Key rotation proof | ✅ | | | |
| #4 Cobertura >60% | ✅ | | | |
| #7 Pen test | ✅ | | | |
| #6 Dual-admin | | ✅ | | |
| #1 as any <50 | | ✅ | | |
| #2 God functions | | ✅ | | |
| #3 refetchInterval | | | ✅ | |
| #10 Load test | | | ✅ | |

## CRITÉRIOS DE CERTIFICAÇÃO SOC 2 (Gate Final)

- [ ] Nonce/replay: tabela `hmac_consumed_nonces` operacional, replay rejeitado
- [ ] Restore: ≥4 registros em `backup_verifications` (1/semana × 4 semanas)
- [ ] Key rotation: ≥1 rotação documentada em `key_rotation_audit_log`
- [ ] Dual-admin: ações críticas bloqueadas sem segunda aprovação
- [ ] Cobertura: ≥60% (statements + branches) via vitest --coverage
- [ ] Pen test: relatório formal com zero Critical/High não remediados
- [ ] `as any`: <50 casts em produção
- [ ] God functions: nenhum arquivo >500 linhas em edge functions
- [ ] Polling: ≤30 refetchInterval, zero polling em abas ocultas
