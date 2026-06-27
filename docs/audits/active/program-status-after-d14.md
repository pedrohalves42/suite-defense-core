# Program Status — Pós D14 / Início D15

**Data:** 2026-06-27
**Escopo:** Saneamento de dívida de tipagem (`@ts-nocheck`) + hardening de contratos em Edge Functions.

---

## 1. Blocos concluídos

| Bloco                    | Escopo                                              | Estado |
| ------------------------ | --------------------------------------------------- | ------ |
| B / C                    | Lint, gates iniciais, cleanup de `.bak`             | ✅ |
| D1–D9                    | Agent runtime core (heartbeat, poll, submit, etc.)  | ✅ |
| D10–D12                  | Inventário, scanner, `_shared/` type-clean          | ✅ |
| D13                      | Inventário global pós-`_shared`                     | ✅ |
| D14-A1                   | Billing (`create-checkout`, `check-subscription`)   | ✅ |
| D14-A2                   | Auth / Identity (enrollment, fido2-register)        | ✅ |
| D14-A3                   | Public / HMAC / anti-abuse                          | ✅ |
| D14-A4                   | Public / Release / Signing + API-GATEWAY-DRIFT-01   | ✅ |
| HF-AUDIT-CONTRACT-01     | `userId` opcional em `_shared/audit.ts`             | ✅ |
| HF-BILLING-AUDIT-01      | Audit logs em billing/Stripe                        | ✅ |
| HF-SHARED-RECOVER-01     | Recovery de narrowing em `_shared/agent-auth`       | ✅ |
| HOTFIX-AUTH-01 / -02     | `metadata_hash` órfão + RPC replay 42883            | ✅ |
| HF-HMAC-01 / -02         | `timingSafeEqual` + `EdgeRuntime.waitUntil` no dispatch | ✅ |
| **D15-B1**               | **Ops Gateway + Ops Playbook**                      | ✅ |

---

## 2. Métricas — antes × depois

| Métrica                              | Inicial   | Pós D14-A4 | Pós D15-B1 |
| ------------------------------------ | --------- | ---------- | ---------- |
| `@ts-nocheck` ativos em `supabase/functions/` | ~122 | 78 | **60** |
| Arquivos protegidos pelo gate Tier 1 | 0         | 55         | **75**     |
| `_shared/` type-clean                | ❌        | ✅         | ✅         |
| `api-gateway/index.ts` `deno check`  | ❌        | ✅         | ✅         |
| `ops-gateway/index.ts` `deno check`  | ❌        | —          | ✅         |
| `ops-playbook/index.ts` `deno check` | ❌        | —          | ✅         |
| Redução acumulada de dívida          | —         | ~36%       | **~51%**   |

---

## 3. Bugs latentes corrigidos durante o saneamento

1. **HMAC `timingSafeEqual`** — ReferenceError mascarava falhas de auth (HF-HMAC-01).
2. **`dispatch()` órfão** — Sem `waitUntil`, podia cancelar upsert/log do coalescer (HF-HMAC-02).
3. **`metadata_hash` órfão** — Falsos 401s via PostgREST (HOTFIX-AUTH-01).
4. **RPC `hmac_check_and_record`** — Drift de tipo BOOLEAN×INTEGER (HOTFIX-AUTH-02).
5. **`recordTokenFailure`** — Gap de observabilidade em 401 (`token_validation_failures`).
6. **`signWithPrivateKey`** — Faltava validação de `ECDSA_PRIVATE_KEY` (D14-A4).
7. **`handleRevenueProjectionsV2`** — Import faltante no `api-gateway/index.ts`.
8. **Honeypot path órfão** — `./honeypot.ts` → `./handlers/honeypot.ts`.
9. **`check-tenant-abuse`** — `ReferenceError` corrigido (D14-A3).

---

## 4. Findings encerrados

- `API-GATEWAY-DRIFT-01` — absorvido em D14-A4.
- `AUDIT-CONTRACT-01` — fechado por HF-AUDIT-CONTRACT-01.
- `BILLING-AUDIT-01` — fechado por HF-BILLING-AUDIT-01.
- `FIDO2-PUBKEY-TYPE-01` — corrigido durante D14-A2.

## 5. Findings pendentes

- `TYPEGEN-SYNC-01` — automação de sincronização de `database.types.ts` (proposto).
- **Domain Gates** — segmentar gate por domínio (proposto, ainda sem implementação).
- Audit hashing chain rotation — backlog Q3.

---

## 6. Backlog D15–D17

### D15 — Ops Platform
- ✅ **D15-B1** — Ops Gateway / Ops Playbook (concluído neste bloco).
- ⏳ D15-B2 — Ops Sync (`ops-sync/*`).
- ⏳ D15-B3 — Ops Reports (`ops-reports/*`).
- ⏳ D15-B4 — Automation Runtime (`evaluate-playbook-triggers`, `evaluate-automation-rules`,
  `execute-playbook-action`, `auto-remediate`, `autonomous-safe-mode`).

### D16 — AI / Insights
- AI insights generation, embedding pipelines, copilot handlers.

### D17 — Build / Legacy
- Funções legadas de baixo risco, scripts de release antigos, limpeza final.

---

## 7. Próximo bloco recomendado

**D15-B2 — Ops Sync**, mantendo o padrão:
- remoção exclusiva de `@ts-nocheck`;
- mudanças type-only;
- runtime preservado;
- `deno check` limpo no entrypoint;
- expansão do gate Tier 1;
- relatório de fechamento.
