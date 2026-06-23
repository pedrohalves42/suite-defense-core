# CLEAN-01 — Inventário de Limpeza Estrutural

**Status:** ACTIVE — leitura/análise. **Nada é deletado nesta PR.**
**Branch sugerida:** `chore/clean-01-repo-structure`
**Gerado:** 2026-06-23 (pós HOTFIX-AUTH-01)
**Escopo:** mapeamento e classificação. Mudanças destrutivas vão para CLEAN-02..06.

---

## 0. Pré-condições

- HOTFIX-AUTH-01 deployado; aguardando confirmação positiva no próximo ciclo de heartbeat.
- `hmac_success_coalescing` (global + tenant Genial Cred) = **OFF**. PP02-A não será reaberto até CLEAN concluído.
- Nenhum arquivo do core path (`auth → heartbeat → jobs → submit-job-result → evidence`) será movido sem PR isolada + smoke.

---

## 1. Resumo quantitativo

| Métrica | Valor | Observação |
|---|---:|---|
| `@ts-nocheck` em edge functions | **126** arquivos | Bloqueia CLEAN-04/05 até triagem |
| `@ts-ignore` (excluindo `dev-dist/`) | ~6 ocorrências reais | Concentrado em `_shared/hexagonal/` |
| `eslint-disable` (file-level) | ~80 ocorrências | A reavaliar por risco |
| TODO/FIXME/HACK em código (não-md, não-dist) | **14** | Ruído baixo |
| Scripts em `scripts/` (root) | **59** arquivos | Mistura crítico + one-off |
| Edge functions | **77** | Várias com lógica duplicada |
| Migrations aplicadas | **82** | NÃO editar/remover histórico |
| Arquivos `.bak` no repo | **1** | `supabase/functions/ops-gateway/legacy/check.ts.bak` |
| `select('*')` em código ativo | ~24 ocorrências | Viola regra de projeção |
| `dangerouslySetInnerHTML` real | 2 (SEO json-ld, FormattedText sanitized) | Aceitos |
| `metadata_hash` residual | Limpo no caminho crítico ✅ | Resíduos só em PS1 do agente e RPC SQL (intencional) |

---

## 2. Classificação de diretórios

### 2.1 Núcleo de operação — **NÃO mexer sem teste**
```
supabase/functions/_shared/agent-auth.ts
supabase/functions/_shared/hmac.ts
supabase/functions/_shared/logger.ts
supabase/functions/_shared/feature-flags*
supabase/functions/_shared/serve-agent.ts
supabase/functions/heartbeat/**
supabase/functions/poll-jobs/**
supabase/functions/submit-job-result/**
supabase/functions/submit-hmac-router/**
supabase/functions/submit-router/**
supabase/functions/ack-job/**
supabase/functions/enroll-agent/**
supabase/functions/register-agent-key/**
supabase/functions/serve-agent-update/**
supabase/migrations/**
```
Qualquer alteração nesses arquivos → PR isolada + smoke `auth → heartbeat → jobs`.

### 2.2 Código ativo (refactor permitido com cuidado)
- `src/components/`, `src/hooks/`, `src/pages/`, `src/lib/`
- `supabase/functions/api-gateway/`, `ops-gateway/handlers/`, `ai-*/`

### 2.3 Documentação ativa
- `docs/adr/`, `docs/architecture/`, `docs/runbooks/`, `docs/policies/`, `docs/security/`
- `docs/audits/` — atualmente plana, ver §5

### 2.4 Scripts críticos (preservar)
| Script | Função |
|---|---|
| `scripts/security-gate.sql`, `security-audit.ts` | CI security |
| `scripts/sync-agent-source.ts`, `sync-agent-*.sh`, `sync-shared-types.ts` | Sync agente / tipos |
| `scripts/job-engine-lint.sh`, `job-engine-health-gate.sql` | CI job engine |
| `scripts/ci_quality_gate.py`, `classify-ts-errors.cjs` | CI |
| `scripts/run-e2e-tests.{sh,ps1}` | E2E |
| `scripts/check-agent-sync.sh`, `validate-multi-tenant-tables.sh` | CI |
| `scripts/audit-errors.ts`, `parse-edge-errors.js`, `lint-fetch.ts` | Lint |
| `scripts/inventory_deno_serve.py`, `unify-windows-agent.ts` | Tooling |
| `scripts/generate-security-evidence.ts` | SOC2 evidence |
| `scripts/cybershield-agent-windows-v4.1.2.ps1` | Agente Windows (fonte) |
| `scripts/rls-isolation-test.sql`, `adr026-invariants-test.sql`, `test-jobs-v3.sql` | Contract/RLS tests |
| `scripts/diagnostic-queries.sql`, `cleanup-agent.sql` | Runbook DB |

### 2.5 Candidatos a `scripts/legacy/agent/` (mover, **não deletar**)
| Arquivo | Motivo |
|---|---|
| `scripts/fix-agent-releases-v3-10-9.js` | Hotfix versão antiga |
| `scripts/redeploy-agents-v3.ps1` | v3 já obsoleto (v4.1.2 ativo) |
| `scripts/fix-agent-installation.ps1` | One-off histórico |
| `scripts/test-v3-2-4-unblock-fix.ps1` | One-off versão antiga |
| `scripts/test-testev2-complete.ps1` | One-off |
| `scripts/debug-vm-install.ps1`, `vm-validation-complete.ps1` | Debug pontual |
| `scripts/recreate-agent-task.ps1`, `cleanup-agents.ps1` | Operações manuais — mover para `scripts/runbook/` |
| `scripts/diagnose-duplicate-agents.ps1`, `diagnose-executionpolicy.ps1`, `diagnose-security-restrictions.ps1` | Diagnóstico → `scripts/runbook/diagnostics/` |
| `scripts/analyze-installer-log.ps1`, `verificar-installer-agente.ps1`, `quick-validate-installer-version.ps1`, `validate-emergency-installer.ps1`, `validate-and-test-agent.ps1`, `validate-phase-1-3.ps1`, `validate-agent-config.ps1`, `validate-agent-encoding.ps1`, `installer-validation.ps1`, `run-complete-validation.ps1`, `FASE1_VALIDATION_INSTRUCTIONS.md` | Validação one-off → consolidar em `scripts/validation/` (decidir manter vs arquivar) |
| `scripts/sync-and-register.ps1`, `sync-all-agents.js`, `deploy-agent-update.ps1` | Deploy histórico — confirmar uso atual antes de mover |
| `scripts/backup-restore-test.sh` | Runbook DR → `scripts/runbook/` |
| `public/scripts/fix-scheduled-task.ps1`, `reinstall-agent-clean.ps1`, `reinstall-agent-preserve.ps1`, `reinstall-agent-v3.ps1`, `reinstall-cybershield-agent.ps1`, `reinstall-cybershield-agent-v412.ps1` | **Servidos publicamente** — confirmar quais são linkados pelo app antes de qualquer movimento |

### 2.6 Lixo confirmado (remover em CLEAN-06 após validação)
- `supabase/functions/ops-gateway/legacy/check.ts.bak` — `.bak` no repo.

### 2.7 Gerado/build (deve estar no `.gitignore`, validar)
- `dev-dist/` (workbox PWA dev build)
- `test-results.json`
- `coverage/`, `dist/`, `node_modules/`

---

## 3. Débito de tipos — `@ts-nocheck` (126 arquivos)

### Tier 1 — Crítico (PR isolada cada um, com smoke)
```
supabase/functions/heartbeat/index.ts                       ← CLEAN-05 alvo
supabase/functions/poll-jobs/index.ts
supabase/functions/submit-job-result/index.ts
supabase/functions/ack-job/index.ts
supabase/functions/submit-hmac-router/index.ts
supabase/functions/enroll-agent/index.ts
supabase/functions/register-agent-key/index.ts
supabase/functions/serve-agent-update/index.ts
supabase/functions/confirm-force-update/index.ts
supabase/functions/_shared/serve-agent.ts
supabase/functions/_shared/submit-handlers/alert-engine.ts
supabase/functions/_shared/submit-handlers/web-activity-helpers.ts
supabase/functions/_shared/domain-events.ts
supabase/functions/_shared/dlq.ts
supabase/functions/_shared/ip-allowlist.ts
supabase/functions/_shared/ai-multi-provider.ts
supabase/functions/_shared/ai-evidence-types.ts
supabase/functions/_shared/hexagonal/adapters.ts
```

### Tier 2 — Importante (lote)
```
supabase/functions/api-gateway/handlers/*.ts                 (8 arquivos)
supabase/functions/ops-gateway/handlers/*.ts                 (13 arquivos)
supabase/functions/ops-playbook/handlers/*.ts                (2 arquivos)
supabase/functions/ops-reports/**                            (3 arquivos)
supabase/functions/ops-sync/**                               (3 arquivos)
supabase/functions/scim-provisioning/**                      (3 arquivos)
supabase/functions/autonomous-safe-mode/**                   (4 arquivos)
supabase/functions/evaluate-automation-rules/**              (4 arquivos)
supabase/functions/ai-router/**                              (4 arquivos)
supabase/functions/_shared/serve-tenant.ts
```

### Tier 3 — Baixo risco (lote por feature)
```
ai-* (8)  build-* (2)  check-* (3)  collect-router  create-*  
diagnostics-*  execute-*  fido2-*  force-*  generate-*  get-* (5)
honeypot-handler  list-reports  post-installation-telemetry
promote-agent-v5  public-gateway/**  saml-sso  scan-*  setup-agent-script
sign-release  soc2-evidence-collector  stripe-webhook  update-baseline
upload-*  validate-build-pipeline
```

**Regra:** começar por Tier 3 → Tier 2 → Tier 1. Heartbeat (Tier 1) tem PR dedicada em CLEAN-05.

---

## 4. Lint debt — amostras de risco

### 4.1 `select('*')` em código ativo (24 ocorrências)
Concentração:
- `supabase/functions/_shared/infrastructure/billing/adapters/supabase-billing-repository.ts` — **8 ocorrências**
- `supabase/functions/_shared/hexagonal/repositories/check.repository.ts` — **8 ocorrências**
- `supabase/functions/_shared/infrastructure/deployment/adapters/supabase-agent-release.repository.ts` — 2
- `supabase/functions/heartbeat/force-update.ts` — 1 (revisar em CLEAN-05)
- `src/lib/tenantQuery.ts:79` — em comentário JSDoc (FP, ignorar)
- `src/hooks/useAgentCausality.ts:66`, `useForensicSnapshots.tsx:107`, `src/components/AgentSelector.tsx:42`

**Ação em CLEAN-02:** projetar colunas explicitamente em billing + check repositories.

### 4.2 Resíduo `metadata_hash` pós HOTFIX-AUTH-01
Caminho crítico **limpo**. Resíduos restantes (esperados, não-bloqueantes):
- `scripts/cybershield-agent-windows-v4.1.2.ps1` — agente envia o hash no payload (forward-compat) ✅
- `supabase/migrations/202605*.sql` — RPC `update_agent_heartbeat_atomic` aceita `p_metadata_hash` e faz `COALESCE` (no-op pois coluna inexistente) ✅
- `supabase/functions/enroll-agent/index.ts:70` — passa `p_metadata_hash` para RPC ✅
- `supabase/functions/heartbeat/types.ts` — interfaces ainda declaram o campo opcional ✅
- `src/integrations/supabase/types.ts` — autogen, intocável ✅

**Decisão estrutural pendente (fora de CLEAN-01):** ou (a) criar coluna `metadata_hash` em `agents` via migration corretiva e religar o caminho, ou (b) remover o campo de ponta a ponta (parser + RPC + agente). Adiar até CLEAN concluído.

### 4.3 `dangerouslySetInnerHTML`
- `src/components/landing/SEO.tsx` — `JSON.stringify(data)` em json-ld (aceitável)
- `src/components/ui/FormattedText.tsx` — usa sanitizer (aceitável)
- Memória `frontend-vulnerability-mitigation-standard` respeitada ✅

---

## 5. Reorganização proposta (executar em CLEAN-06, **não agora**)

### 5.1 `docs/audits/`
```
docs/audits/
  active/
    clean-01-inventory.md                 ← este arquivo
    pp02a-hmac-success-coalescing.md
    hotfix-auth-01-metadata-hash.md       ← criar
  closed/
    sp03-rpc-execute-allowlist.md
    sp05-ack-job-trigger.md
    2026-06-22-error-handling-hardening.md
    2026-06-22-full-code-review.md
  archive/
    2026-05-15-viktor-hale-baseline.md
    2026-05-15-viktor-hale-cycle-2.md
    preflight-inventory.md
    pp02-telemetry-batching-proposal.md
    full-review-grouped.md
  findings/ (mantido)
  REMEDIATION-BACKLOG.md (mantido na raiz)
```

### 5.2 `scripts/`
```
scripts/
  agent/       (sync, build, deploy ativos)
  ci/          (security-gate, quality-gate, lint-fetch, audit-errors)
  db/          (rls-isolation-test, diagnostic-queries, security-gate.sql, job-engine-*)
  runbook/     (cleanup-agents, recreate-agent-task, backup-restore-test, diagnostics/)
  validation/  (installer-validation, validate-*, analyze-installer-log)
  e2e/         (run-e2e-tests.*)
  legacy/
    agent-v3/  (fix-agent-releases-v3-10-9.js, redeploy-agents-v3.ps1, test-v3-2-4-*)
    one-off/   (fix-agent-installation, test-testev2-complete, debug-vm-install)
```
**Atenção:** `public/scripts/*` é servido pelo CDN público; antes de mover/renomear, varrer todas as referências (`href`, `fetch`, `Invoke-WebRequest`) e atualizar.

### 5.3 `supabase/functions/_shared/` (refactor estrutural — proposta, **não nesta wave**)
Manter como proposta documentada. Não tocar até CLEAN-02..06 estarem concluídos.

---

## 6. Política definida

1. **Mover antes de deletar.** Qualquer candidato a remoção vai para `legacy/` ou `archive/` por ≥1 ciclo de validação.
2. **Migrations já aplicadas nunca são editadas nem removidas.** Correções vêm via nova migration.
3. **Core path** (§2.1) só em PR isolada com smoke `auth → heartbeat → jobs → submit-job-result`.
4. **`public/scripts/`** exige grep cruzado antes de qualquer alteração de nome/caminho.
5. **`knip`/`depcheck`/`ts-prune`** rodam apenas em modo relatório; resultados precisam de revisão humana antes de qualquer remoção (alto risco de FP em edge functions e scripts de deploy).
6. **`@ts-expect-error` preferido a `@ts-ignore`** quando inevitável; comentário deve referenciar issue.

---

## 7. Critério de aceite das próximas PRs

```
tsc --noEmit             = 0 erros
eslint                   = 0 erros (warnings reduzidos com relatório anexo)
supabase linter          = sem regressão
security gate (CI)       = verde
heartbeat smoke          = OK
agent auth smoke         = OK
jobs smoke               = OK
arquivos do §2.1         = inalterados ou com smoke anexo na PR
```

---

## 8. Próximas PRs (ordem)

| PR | Escopo | Pode mexer em §2.1? |
|---|---|---|
| **CLEAN-02 Q-P0 real** | `no-case-declarations`, dead branches, código inalcançável (priorizar hooks/auth/agent/jobs/dashboard) | Não |
| **CLEAN-03 imports/unused** | `src/pages/`, `src/hooks/`, `src/components/` | Não |
| **CLEAN-04 type debt (`any`)** | `src/hooks/`, `src/lib/`, `src/pages/admin/` (evitar `_shared/hmac.ts`) | Não |
| **CLEAN-05 `@ts-nocheck` heartbeat** | só `supabase/functions/heartbeat/index.ts` + smoke | **Sim**, isolada |
| **CLEAN-06 scripts/docs** | mover para `legacy/`, `archive/`, estrutura de §5 | Não (só docs/scripts) |
| **(depois)** Reabertura PP02-B canário | — | — |

---

## 9. Métricas de saída de CLEAN-01

- Este inventário cria a baseline. CLEAN-02..06 devem reportar:
  - Δ `@ts-nocheck`: de **126** para alvo
  - Δ `select('*')`: de **24** para alvo
  - Δ warnings ESLint: anexar relatório antes/depois
  - Δ arquivos em `scripts/` (root): de **59** para ≤15 (resto reorganizado)
