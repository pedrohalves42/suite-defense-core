# D10 — Global Type Debt Inventory

**Modo:** read-only. Nenhum arquivo de runtime alterado.
**Data:** 2026-06-25
**Escopo:** `supabase/functions/**`

---

## 1. Objetivo

Recalcular o mapa real da dívida de tipos após D9-X1..X6, antes de abrir D11+.
Medir: `@ts-nocheck` restantes, `any`/casts residuais, e `deno check` em helpers
compartilhados e funções críticas. Definir a próxima ordem de ataque com base em
evidência — não em intuição.

---

## 2. Comandos executados

```bash
rg -l "@ts-nocheck" supabase/functions | sort
rg -n "\bany\b" supabase/functions --type ts | wc -l
rg -n "\bas any\b" supabase/functions --type ts | wc -l
rg -n "as unknown as" supabase/functions --type ts | wc -l
rg -n "<any>" supabase/functions --type ts | wc -l
rg -n "Record<string, any>" supabase/functions --type ts | wc -l
rg -n "catch\s*\([^)]*:\s*any" supabase/functions --type ts | wc -l

# deno check em todos os helpers compartilhados (85 arquivos)
for f in supabase/functions/_shared/*.ts; do
  deno check --config config/deno.json "$f"
done

# deno check em funções críticas já tocadas
deno check supabase/functions/heartbeat/index.ts
deno check supabase/functions/poll-jobs/index.ts
deno check supabase/functions/ack-job/index.ts
deno check supabase/functions/submit-router/index.ts
deno check supabase/functions/submit-job-result/index.ts
deno check supabase/functions/public-gateway/index.ts
deno check supabase/functions/stripe-webhook/index.ts
deno check supabase/functions/saml-sso/index.ts
deno check supabase/functions/scim-provisioning/index.ts
```

---

## 3. Resultado geral

| Métrica | Valor |
|---|---:|
| Arquivos com `@ts-nocheck` (edge) | **115** |
| `@ts-nocheck` em `_shared/` | **9** |
| `any` tokens (texto) | 759 |
| `as any` | **150** |
| `as unknown as` | 13 |
| `<any>` | 30 |
| `Record<string, any>` | 31 |
| `catch (... : any)` explícito | 1 |
| `_shared/*.ts` com erro `deno check` | **0 / 85** |
| Funções críticas verificadas | **9** |
| Funções críticas com erro `deno check` | **5** (heartbeat, ack-job, submit-router, saml-sso, scim-provisioning) |
| Funções críticas limpas | **4** (poll-jobs, submit-job-result, public-gateway, stripe-webhook) |

**Headline:** o núcleo compartilhado (`_shared/`) está com 0 erros depois de
D9-X1..X6. A dívida agora é majoritariamente periférica (handlers e funções
internas), mas 5 funções de Tier 1/2 ainda têm erros reais de tipo.

---

## 4. `@ts-nocheck` por Tier

### Tier 1 — auth / agent / tenant / billing / identity / webhook / public edge (≈ 24)

> Caminho crítico. Deve ir primeiro em D11.

- `_shared/serve-agent.ts` ⚠️ (ainda nocheck após D9-X1)
- `_shared/ip-allowlist.ts`
- `_shared/dlq.ts`
- `_shared/domain-events.ts`
- `_shared/hexagonal/adapters.ts`
- `_shared/submit-handlers/alert-engine.ts`
- `_shared/submit-handlers/web-activity-helpers.ts`
- `heartbeat/index.ts` ⚠️ (ainda nocheck após D3)
- `poll-jobs/index.ts` ⚠️ (ainda nocheck após D6)
- `ack-job/index.ts` ⚠️ (ainda nocheck após D7)
- `submit-router/index.ts` ⚠️ (ainda nocheck após D5)
- `submit-job-result/index.ts` ⚠️ (ainda nocheck após D4)
- `submit-hmac-router/index.ts`
- `enroll-agent/index.ts`
- `register-agent-key/index.ts` ⚠️ (ainda nocheck após D8)
- `register-agent-key/fingerprint-utils.ts`
- `register-agent-release/index.ts`
- `confirm-force-update/index.ts`
- `check-agent-updates/index.ts`
- `check-subscription/index.ts`
- `create-checkout/index.ts`
- `fido2-register/index.ts`
- `public-gateway/handlers/fido2-auth.ts` ⚠️
- `public-gateway/handlers/software-risk.ts` ⚠️
- `honeypot-handler/index.ts`
- `post-installation-telemetry/index.ts`
- `collect-router/index.ts`

> ⚠️ Importante: os PRs D2..D8 e D9-X1 removeram `@ts-nocheck`, mas a marca
> *voltou* nos arquivos sinalizados. **Possíveis causas:** revert acidental,
> re-introdução automática por outro PR, ou cópias antigas restauradas.
> **Ação D11-Pré:** verificar `git blame` antes de re-tipar — não duplicar
> trabalho já feito.

### Tier 2 — admin / automation / AI / reports / monitoring / jobs (≈ 60)

- AI: `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`,
  `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check/*`,
  `ai-red-team-assessment`, `ai-router/*` (4 arquivos), `ai-system-analyzer/*`,
  `ai-system-audit/*`, `_shared/ai-evidence-types.ts`, `_shared/ai-multi-provider.ts`
- Automation: `evaluate-automation-rules/*` (4 arquivos),
  `evaluate-playbook-triggers`, `execute-playbook-action`, `autonomous-safe-mode/*` (4),
  `auto-remediate`, `auto-generate-enrollment`
- Ops/Admin: `api-gateway/handlers/*` (7), `ops-gateway/handlers/*` (15),
  `ops-playbook/*` (3), `ops-reports/*` (3), `ops-sync/*` (3)
- Reports/Build: `build-agent-exe/*` (2), `generate-deploy-package`,
  `generate-portable-installer`, `upload-report`, `upload-release-content`,
  `list-reports`, `soc2-evidence-collector`, `setup-agent-script`,
  `get-latest-agent-script`, `get-diagnostic-script`, `get-agent-script-content`,
  `get-agent-policy`, `get-agent-config`, `get-blocked-websites`,
  `diagnostics-agent-logs`, `validate-build-pipeline`, `update-baseline`,
  `scan-virus`, `scan-vulnerabilities`, `sign-release`, `promote-agent-v5`,
  `force-reinstall-fleet`, `create-reinstall-jobs`, `check-tenant-abuse`,
  `action-center-feed`

### Tier 3 — legacy / devtools / baixa criticidade (≈ 5)

- Nada puramente legacy ficou. Os `ops-gateway/handlers/*` poderiam descer
  para T3 se desativados; hoje seguem como T2.

---

## 5. `any` / casts por criticidade

> Total: **150 `as any`** + **13 `as unknown as`** + **30 `<any>`** + **31 `Record<string, any>`**.

### P0 — auth / tenant / security / payment / identity
- Nenhum `as any` direto em `_shared/hmac.ts`, `_shared/hmac-success-coalescer.ts`,
  `_shared/agent-auth.ts`, `_shared/error-handler.ts`, `_shared/serve-tenant.ts`,
  `_shared/serve-internal.ts` (resultado de D9-X1..X6). ✅
- `_shared/serve-agent.ts` segue com `@ts-nocheck` (P0 pendente).
- `scim-provisioning/user-handlers.ts`: 3 `as any` (identity).
- `submit-job-result/side-effects/network-info.ts`: 9 `as any` (caminho de submit).
- `submit-job-result/execution.ts`: 3 `as any`.

### P1 — handler exposto / Tier 2 quente
- `ops-checks/use-cases/health-monitor.use-case.ts`: **13 `as any`** (maior ofensor).
- `_shared/hexagonal/repositories/check.repository.ts`: **12 `as any`** (helper de Tier 2).
- `ops-checks/use-cases/calculate-behavioral-baselines.use-case.ts`: 8.
- `ops-checks/use-cases/compute-compliance-benchmarks.use-case.ts`: 6.
- `ops-checks/use-cases/cron-sentinel.use-case.ts`: 5.
- `ops-checks/use-cases/analyze-job-failure-patterns.use-case.ts`: 5.
- `ops-gateway/handlers/edr-ops.ts` + `ops-sync/handlers/edr-ops.ts`: 4 cada.
- `heartbeat/force-update.ts`: 3.

### P2 — integração externa
- `_shared/ai-multi-provider.ts`, `_shared/cache.ts` (9), `_shared/build-telemetry.ts` (9),
  `evaluate-automation-rules/protection-pipeline.ts` (11), `ops-gateway/handlers/security-ops.ts` (14).

### P3 — testes / legado
- `heartbeat/__tests__/*` (≈ 50 ocorrências entre 4 arquivos). Baixa prioridade.

---

## 6. Erros reais de `deno check`

`_shared/*.ts` (85 arquivos): **0 erros**. ✅

Funções críticas:

| Arquivo | Erro | Severidade | Causa provável | Próximo bloco |
|---|---|---|---|---|
| `heartbeat/index.ts` (via `state-updater.ts:34`) | TS2344 `'version' \| 'last_heartbeat'` fora do union de colunas | **Alta** | `agents` schema atualizado mas `state-updater` ainda referencia `version`/`last_heartbeat` por chave literal — provável drift com `database.types.ts` | **D11** |
| `heartbeat/state-updater.ts:201` | TS2365 `{} + number` em `currentVersion + 1` | Alta | `currentVersion` inferido como `{}` por causa do erro acima | **D11** (efeito colateral; resolve junto) |
| `heartbeat/state-updater.ts` (process_samples insert) | TS2769 `ProcessSample[]` não atribuível a `Json[]` | Média | Tipo `ProcessSample` precisa de `cast` para `Json` ou definição mais frouxa | **D11** |
| `ack-job/index.ts` | 2× TS2554 `Expected 1-3 args, got 4` | Média | Helper assinatura mudou; chamada não migrada | **D11** |
| `submit-router/index.ts` | 2× TS2307 `Import "zod" not a dependency` | Baixa (config) | `import_map`/`config/deno.json` não declara `zod` para essa função | **D11** (corrigir mapping, não código) |
| `submit-router/index.ts` | TS7006 `data` implícito `any` | Baixa | Faltou anotar callback | **D11** |
| `saml-sso/index.ts` | TS2769 overload | Média | Provável `crypto.subtle` / Supabase query mismatch | **D11** |
| `scim-provisioning/index.ts` | TS2322 `ScimEmail[]` recebendo array com `null` | Média | Falta `.filter(Boolean)` antes do retorno | **D11** |
| `scim-provisioning/index.ts` | TS2677 type predicate inválido | Média | Predicate apertou demais o tipo de entrada | **D11** |

**Limpas:** `poll-jobs/index.ts`, `submit-job-result/index.ts`,
`public-gateway/index.ts`, `stripe-webhook/index.ts`.

---

## 7. Riscos residuais

1. **Drift `@ts-nocheck` em arquivos já limpos.** 10 dos arquivos cobertos por
   D2..D8 e D9-X1 voltaram com `@ts-nocheck` no topo. Antes de re-tipar é
   obrigatório `git log -p` para entender se foi merge ruim, revert, ou outro
   PR que carregou o file de volta.
2. **`state-updater.ts` em discordância com `database.types.ts`.** Se o schema
   real do banco não tem mais `version` ou `last_heartbeat` nesse update path,
   o código pode estar enviando colunas inexistentes em runtime (silenciado
   pelo `@ts-nocheck` em `index.ts`).
3. **`zod` ausente do `deno.json` de algumas funções.** Não é erro de tipo —
   é erro de configuração de imports. Pode quebrar o `deno check` mas
   geralmente roda em runtime via `esm.sh`. Vale alinhar.
4. **150 `as any` espalhados** — sem perigo individual, mas concentrados em
   `ops-checks/use-cases/*` formam um *blind spot* de saúde do sistema.
5. **Testes em `heartbeat/__tests__/*` com muito `as any`** — risco baixo,
   mas torna refactors mais frágeis.

---

## 8. Próxima ordem recomendada

Com base no inventário, a sequência ótima é:

```txt
D11 — Reauditoria Tier 1 com nocheck recolocado
       (serve-agent.ts, heartbeat, poll-jobs, ack-job, submit-router,
        submit-job-result, register-agent-key, public-gateway/handlers/*)
       → começar por `git blame` antes de re-tipar

D11.5 — Fix dirigido dos 10 erros reais de deno check em Tier 1
        (state-updater.ts é o mais sensível — tocar com cuidado de runtime)

D12 — _shared restante (9 arquivos com nocheck):
       serve-agent, ip-allowlist, dlq, domain-events, hexagonal/adapters,
       submit-handlers/alert-engine, submit-handlers/web-activity-helpers,
       ai-evidence-types, ai-multi-provider

D13 — Handlers expostos Tier 2 quentes:
       ops-gateway/handlers/* (15), api-gateway/handlers/* (7)

D14 — Automation/AI/Admin internos (ai-*, ops-playbook, ops-reports, ops-sync)

D15 — Redução de `as any` no top-10 ofensor
       (health-monitor.use-case, check.repository, network-info, etc.)
```

**Recomendação imediata: D11-Pré (read-only)** — `git log` dos 10 arquivos
de Tier 1 com nocheck recolocado, para descobrir *por que* a marca voltou
antes de abrir D11.

---

## Apêndice — Distribuição por função (top)

```
15 ops-gateway/handlers
 9 _shared
 7 api-gateway/handlers
 4 evaluate-automation-rules
 4 autonomous-safe-mode
 4 ai-router
 3 ops-sync
 3 ops-reports
 3 ops-playbook
 2 register-agent-key, public-gateway, build-agent-exe,
   ai-system-audit, ai-system-analyzer, ai-quality-check
```
