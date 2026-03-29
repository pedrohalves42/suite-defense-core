
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

## Ordem de Implementação

| Etapa | Mudanças | Linhas Afetadas | Estimativa |
|-------|----------|----------------|------------|
| 1 | P1.1 — Hash BOM-safe (5 pontos) | 553, 385, 405, 436, 841 | 15 min |
| 2 | P1.2 — Grace period pós-update | 876 + auto-update block | 10 min |
| 3 | P1.3 — Atomic update verification | auto-update flow | 10 min |
| 4 | P1.4 — Log estruturado TOCTOU | 878 | 5 min |
| 5 | P2.1 — Fallback RSA no catch externo | ~1693 | 5 min |
| 6 | P2.2 — Eliminar emergency duplicada | boot sequence | 10 min |
| 7 | P3.1 — ConvertTo-BaselineJson | nova função + 3 call sites | 15 min |
| 8 | P3.2 — Import-BaselineSafe | nova função + 1 call site | 10 min |
| 9 | P3.3 — Mutex de escrita | save baseline | 5 min |
| 10 | Sync public/ + bump version | sync script | 5 min |

**Total: ~90 min**

## Critérios de Sucesso
- [ ] Zero `TOCTOU VIOLATION` em 48h após deploy
- [ ] Boot direto para ENFORCING sem DEGRADED transitório
- [ ] Zero `Corrupted baseline detected` após primeira inicialização
- [ ] Hash do script sincronizado entre source e public
- [ ] Agente v5.0.16 operacional em pcteste1
