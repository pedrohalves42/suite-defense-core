# D16-FINAL — Checkpoint (read-only)

**Data:** 2026-06-27
**Tipo:** 100% read-only. Nenhuma mudança de código, schema, runtime ou gate.
**Escopo:** Consolidar estado do programa pós D16-C3 e planejar D17.

---

## 1. Inventário global de `@ts-nocheck`

Filtro estrito: `^// @ts-nocheck` em `supabase/functions/**/*.ts`
(ignora comentários históricos `@ts-nocheck removed`).

**Total ativo: 23 arquivos / ~2.808 LOC.**

### 1.1 Distribuição por domínio

| Domínio | Arquivos | Observação |
| --- | ---: | --- |
| Build / Release / Installer pipeline | 9 | `build-agent-exe/*`, `generate-deploy-package`, `generate-portable-installer`, `upload-release-content`, `validate-build-pipeline`, `setup-agent-script`, `get-agent-script-content`, `get-latest-agent-script`, `get-diagnostic-script` |
| Agent config / policy distribution   | 5 | `check-agent-updates`, `get-agent-config`, `get-agent-policy`, `get-blocked-websites`, `update-baseline` |
| Agent telemetry / diagnostics        | 2 | `post-installation-telemetry`, `diagnostics-agent-logs` |
| Fleet recovery                       | 2 | `create-reinstall-jobs`, `force-reinstall-fleet` |
| Scanning workers                     | 2 | `scan-virus`, `scan-vulnerabilities` |
| Routing / feed                       | 2 | `action-center-feed`, `collect-router` |
| **Total**                            | **23** | |

### 1.2 Distribuição por criticidade (Tier)

| Tier | Arquivos | Notas |
| --- | ---: | --- |
| **Tier A** (public/auth/billing/identity/service_role) | 0 | Totalmente saneado em D14. |
| **Tier B** (operacional sensível: fleet, scanners, telemetry) | 6 | `create-reinstall-jobs`, `force-reinstall-fleet`, `scan-virus`, `scan-vulnerabilities`, `post-installation-telemetry`, `update-baseline` |
| **Tier C** (produto/analytics/feed)                 | 2 | `action-center-feed`, `collect-router` |
| **Tier D** (build/release/installer pipeline, distribuição de scripts/policies/configs ao agente) | 15 | Restante — baixa criticidade runtime, alta criticidade de release. |

### 1.3 Distribuição por uso de `service_role`

Análise estática preliminar (não-bloqueante; será refinada por bloco no D17):

| Uso | Arquivos (provável) |
| ---: | --- |
| Usa `service_role` direto | 5–7 (release pipeline, fleet recovery, telemetry) |
| Usa `serveAgent`/`serveTenant` middleware | maioria |

### 1.4 Entrypoints públicos restantes

Edge functions com `@ts-nocheck` que aceitam tráfego não-autenticado/anônimo:
nenhum confirmado nesta janela. Toda a superfície pública já foi varrida em
D14-A3/A4. Os 23 restantes são autenticados (agente, admin, ou interno cron).

---

## 2. Cobertura dos gates

### 2.1 Estado atual

- `scripts/guard-no-ts-nocheck-tier1.sh`: **130 arquivos protegidos.**
- `scripts/bloco-c-gates.sh`: PASS (sem `.bak`, sem `dangerouslySetInnerHTML`
  fora da allowlist, sem `console.*` fora dos wrappers).
- `.github/workflows/type-debt-guards.yml`: ativo em `push` e `pull_request`
  para `main`/`develop`.

### 2.2 Áreas cobertas

`_shared/*`, `api-gateway/*`, `ops-gateway/*`, `ops-playbook/*`,
`ops-sync/*`, `ops-reports/*`, `evaluate-automation-rules/*`,
`evaluate-playbook-triggers/*`, `execute-playbook-action`,
`auto-remediate/*`, `autonomous-safe-mode/*`, `ai-*` (domínio completo),
`heartbeat`, `submit-router`, `submit-hmac-router`, `honeypot-handler`,
`check-tenant-abuse`, billing handlers, enrollment, fido2-register,
register-agent-release, sign-release, promote-agent-v5, `security-*`.

### 2.3 Áreas ainda não cobertas pelo gate

Os 23 arquivos com `@ts-nocheck` ativo (não podem entrar no gate até serem
saneados) — todos endereçados nas sub-ondas D17-D1/D2/D3.

---

## 3. Estatísticas do programa

| Marco | `@ts-nocheck` ativos | Gate Tier 1 | Redução vs baseline |
| --- | ---: | ---: | ---: |
| Baseline D13                      | 96  | 0   |   — |
| Pós D14-A4 (Tier A fechado)       | 78  | 55  | ~19% |
| Pós D15-B1 (Ops Gateway/Playbook) | 60  | 75  | ~38% |
| Pós D15-B4 (Automation Runtime)   | 40* | 100 | ~58% |
| Pós D16-C1 (AI Core)              | 33  | 108 | ~66% |
| Pós D16-C2 (AI Analysis)          | 28  | 115 | ~71% |
| **Pós D16-C3 (AI Security)**      | **23** | **130** | **~76%** |

\* Recontagem rigorosa via `^// @ts-nocheck` (corrigida em D15-FINAL).

### 3.1 Hotfixes consolidados

- HF-HMAC-01 / HF-HMAC-02
- HOTFIX-AUTH-01 / HOTFIX-AUTH-02
- HF-SHARED-RECOVER-01
- HF-AUDIT-CONTRACT-01
- HF-BILLING-AUDIT-01
- HF-AUTOMATION-02
- HF-AI-SCHEMA-DRIFT-01
- HF-JOBS-PAYLOAD-HASH-01

### 3.2 Bugs latentes encontrados e tratados

- **HMAC `timingSafeEqual`** (ReferenceError mascarado).
- **`dispatch()` sem `waitUntil`** no coalescer.
- **`metadata_hash` órfão** em `agents_1`.
- **RPC `hmac_check_and_record`** drift BOOL×INTEGER.
- **`signWithPrivateKey`** sem validação de `ECDSA_PRIVATE_KEY`.
- **Honeypot path órfão.**
- **`check-tenant-abuse`** ReferenceError.
- **LATENT-AUTOMATION-01** (`approved_by` removido).
- **LATENT-AUTOMATION-02** (Postgres 42703 em `decision_rules`).
- **LATENT-AI-01..04** (drift de schema em AI handlers).
- **API-GATEWAY-DRIFT-01** (handler/import).

### 3.3 Follow-ups abertos

- **LATENT-AUTOMATION-03** (`payload_hash` policy em jobs) — mitigado por
  `HF-JOBS-PAYLOAD-HASH-01`, restante backlog.
- **LATENT-AUDIT-SCHEMA-01** — drift de tipos em colunas JSON; mitigado por
  casts `as never`, fechamento real depende de `HF-TYPES-REGEN-01`.

---

## 4. Riscos residuais

### 4.1 Dívida de tipagem (23 arquivos)

Concentrada em pipeline de build/release e distribuição de policies para o
agente. Risco runtime baixo, risco de regressão de release moderado.

### 4.2 Hardening funcional (backlog Viktor Hale)

- **F-003** — Isolamento de canais realtime (prefixos de tenant).
- **F-005** — Sunset legado de `ack-job` em jobs críticos.
- **F-006** — Auditoria de handlers externos via API Key.
- **CLEAN-01** — Wave de qualidade/hardening pós-canário.

### 4.3 Infraestrutura

- **HF-TYPES-REGEN-01** — Sincronização automatizada de
  `_shared/database.types.ts` com o schema Postgres.
- **TYPEGEN-SYNC-01** — CI gate para detectar drift.
- **Domain gates** — Segmentar guard Tier 1 por domínio (Tier A/B/C/D).

### 4.4 Operacional

- **PP02-C** — Replanejamento do canário do coalescer `hmac_success_coalescing`
  em tenant com tráfego garantido (Genial Cred ficou inativo nas janelas
  PP02-A e PP02-B). Pré-requisito: tenant interno com agente vivo + janela
  ≥60min monitorada.

---

## 5. Planejamento D17 (proposta)

Reta final do saneamento de `@ts-nocheck`. Mesmo padrão: type-only, runtime
preservado, `deno check` PASS, gate expandido, relatório de fechamento.

### D17-D1 — Build / Release (9 arquivos)

`build-agent-exe/{index,cache}.ts`, `generate-deploy-package`,
`generate-portable-installer`, `upload-release-content`,
`validate-build-pipeline`, `setup-agent-script`,
`get-agent-script-content`, `get-latest-agent-script`,
`get-diagnostic-script`.

- **Risco:** moderado (release pipeline; qualquer drift pode quebrar build de
  agente).
- **Dependências:** `_shared/database.types.ts` atualizado para tabelas
  `agent_releases`, `agent_builds`, `update_packages`.
- **Gate esperado:** +9 → **139**.

### D17-D2 — Agent Ops / Fleet / Scan (9 arquivos)

`check-agent-updates`, `get-agent-config`, `get-agent-policy`,
`get-blocked-websites`, `update-baseline`, `post-installation-telemetry`,
`diagnostics-agent-logs`, `create-reinstall-jobs`, `force-reinstall-fleet`,
`scan-virus`, `scan-vulnerabilities`.

- **Risco:** moderado-alto (fleet recovery + scanners tocam estado de
  agente em produção).
- **Dependências:** confirmar contratos de `jobs` e `agent_policies`.
- **Gate esperado:** +9 → **148**.

### D17-D3 — Misc / Routing / Feed (2 arquivos + cleanup)

`action-center-feed`, `collect-router`.

- **Risco:** baixo.
- **Dependências:** nenhuma.
- **Gate esperado:** +2 → **150** (alvo final).

### Pós D17

Restará apenas hardening funcional (F-003/005/006, CLEAN-01) e governança
(HF-TYPES-REGEN-01, domain gates, audit hashing chain rotation).

---

## 6. Veredito

**Programa saudável. ~76% da dívida de tipagem eliminada com zero
regressão funcional comprovada e 8 bugs latentes corrigidos no caminho.**
Recomendo abrir **D17-D1** como próximo bloco; PP02-C pode rodar em
paralelo assim que houver tenant com tráfego ativo disponível.
