# D9-X5 — `_shared/hmac.ts` result

## Erros encontrados antes

| Erro | Local | Causa |
|------|-------|-------|
| TS2769 | line 155 — `crypto.subtle.digest('SHA-256', keyData)` | `Uint8Array<ArrayBufferLike>` não atribuível a `BufferSource` (ArrayBufferLike vs ArrayBuffer). Mesma classe já mitigada na linha 170 via `.buffer as ArrayBuffer`. |

Resíduos de `any` (não-erro, mas em escopo permitido): linhas 55, 410, 424, 430, 438.

## Alterações feitas

| Mudança | Local | Tipo |
|---------|-------|------|
| `keyData` → `keyData.buffer as ArrayBuffer` em `crypto.subtle.digest` | line 155 | Type-only — mesma forma já usada em `importKey` (line 170). Zero runtime change. |
| `catch (e: any)` → `catch (e: unknown)` + narrowing `e instanceof Error ? e.message : String(e)` | lines 55, 410, 438 | Mensagem preservada byte-a-byte para Errors; fallback `String(e)` para não-Error. |
| `.catch((e: any) => ...)` → `.catch((e: unknown) => ...)` + narrowing | line 430 | Idem. |
| `(globalThis as any).EdgeRuntime` + `runtime: any` → `EdgeRuntimeLike = { waitUntil?: (p: Promise<unknown>) => void }` | line 424 | Apenas typing; `typeof runtime.waitUntil === 'function'` continua sendo a guarda real de despacho. |

Decisões conservadoras:
- `supabase: any` mantido em `isHmacCoalescingEnabled`, `verifyHmacSignature`, `logAuthFailure`. Trocar para `SupabaseClient<Database>` propagaria restrição para `poll-jobs/auth-handler.ts`, `serve-agent.ts`, `serve-tenant.ts`, etc. Fora do escopo D9-X5 (tipagem apenas, blast radius mínimo).
- Nenhuma assinatura pública alterada.
- Nenhuma string de erro/log alterada (incluindo `[HMAC] Cache dispatch failed`, `[hmac-coalescer] flag read failed, defaulting to disabled`, `[HMAC] Cache dispatch fallback rejected`, `[HMAC] waitUntil scheduling failed`).

## Invariantes preservadas

| Item | Estado |
|------|--------|
| Algoritmo HMAC (SHA-256, hex) | ✅ intacto |
| Canonicalização (`${ts}${sep}${nonce}${sep}${body}`) | ✅ intacto |
| Headers assinados (`X-HMAC-Signature`, `X-HMAC-Timestamp`/`X-Timestamp`, `X-HMAC-Nonce`/`X-Nonce`) | ✅ intacto |
| Timestamp tolerance + `tenant_security_policies.max_clock_skew_seconds` | ✅ intacto |
| Replay window via RPC `hmac_check_and_record` | ✅ intacto |
| `timingSafeEqual` (re-export de `crypto-utils`) e `timingSafeHexCompare` async | ✅ intacto |
| `verifyHmacSignature` fast-path / slow-path / variants | ✅ intacto |
| Coalescer PP02-A/B + flag `hmac_success_coalescing` (default OFF, fail-closed) | ✅ intacto |
| `EdgeRuntime.waitUntil(dispatch())` + fallback `.catch` | ✅ intacto |
| `logAuthFailure` (severities, cache 5 min, evidence hash SHA-256) | ✅ intacto |
| Códigos `AUTH_MISSING_HEADERS`, `AUTH_INVALID_SECRET_FORMAT`, `AUTH_TIMESTAMP_OUT_OF_RANGE`, `AUTH_REPLAY_DETECTED`, `AUTH_REPLAY_CHECK_FAILED`, `AUTH_INVALID_SIGNATURE` | ✅ intactos |

## Consumers checados

```
deno check supabase/functions/_shared/hmac.ts                     ✅ 0 erros
deno check supabase/functions/_shared/serve-agent.ts              ✅ 0 erros
deno check supabase/functions/heartbeat/index.ts                  ✅ 0 erros
deno check supabase/functions/submit-job-result/index.ts          ✅ 0 erros
deno check supabase/functions/poll-jobs/index.ts                  ✅ 0 erros
deno check supabase/functions/_shared/hmac-success-coalescer.ts   ✅ 0 erros
```

## Riscos residuais

- `supabase: any` permanece (escopo declarado). Endereçar em wave dedicada de tipagem cliente, junto com `poll-jobs/auth-handler.ts`, `serve-agent.ts`, `serve-tenant.ts`.
- `EdgeRuntimeLike` é declarado localmente. Se a Lovable Cloud expuser tipos oficiais para `EdgeRuntime`, alinhar.
- Smoke real (assinatura válida / inválida / replay / coalescer ON/OFF) não foi executado neste passo — apenas typecheck. Para mover canário (PP02-C+) com confiança, repetir T+30/T+60 contra tenant com tráfego real.

## Próximo alvo recomendado

`D9-X6 — _shared/hmac-success-coalescer.ts` (coalescer interno, mesmo blast radius restrito do hmac.ts, já consumido por este arquivo). Mantém a ordem natural de tipagem do success path antes de avançar para handlers de endpoint.
