# D9-X5 — `_shared/hmac.ts` inventory

## Pre-fix `deno check` output

```
TS2769 — No overload matches this call. (crypto.subtle.digest)
  at supabase/functions/_shared/hmac.ts:155:59
  Uint8Array<ArrayBufferLike> not assignable to BufferSource
  (ArrayBufferLike vs ArrayBuffer — SharedArrayBuffer mismatch)
```

1 hard error. Same error class already mitigated on line 170 via
`keyData.buffer as ArrayBuffer` cast; line 155 missed the same fix.

## `any` residual in scope (PERMITTED to clean)

| Linha | Trecho                                                | Ação prevista |
|-------|-------------------------------------------------------|---------------|
| 22    | `supabase: any` (isHmacCoalescingEnabled)             | manter (consumers passam clients untyped — não quebrar contrato) |
| 55    | `catch (e: any)` (coalescer flag read)                | `unknown` + narrowing |
| 222   | `supabase: any` (verifyHmacSignature)                 | manter (assinatura pública estável) |
| 410   | `catch (e: any)` (dispatch failure)                   | `unknown` + narrowing |
| 424   | `(globalThis as any).EdgeRuntime` / `runtime: any`    | tipar como `{ waitUntil?: (p: Promise<unknown>) => void } \| undefined` sem mudar semântica |
| 430   | `.catch((e: any) => ...)` fallback                    | `unknown` + narrowing |
| 438   | `catch (e: any)` waitUntil scheduling                 | `unknown` + narrowing |
| 587   | `supabase: any` (logAuthFailure)                      | manter |

> `supabase: any` é mantido propositalmente: trocar para
> `SupabaseClient<Database>` propaga restrição de tipos para `poll-jobs/auth-handler.ts`,
> `serve-agent.ts`, etc., que hoje passam clients sem genéricos. Está fora do
> escopo D9-X5 (tipagem apenas, zero mudança de runtime e zero alargamento de blast radius).

## Consumers mapeados

```
supabase/functions/serve-agent-update/index.ts
supabase/functions/_shared/assert-internal-caller.ts
supabase/functions/_shared/validate-caller-tenant.ts
supabase/functions/confirm-force-update/index.ts
supabase/functions/poll-jobs/auth-handler.ts
supabase/functions/public-gateway/handlers/verify-compliance-report.ts
supabase/functions/public-gateway/handlers/track-installation.ts
supabase/functions/_shared/serve-tenant.ts
supabase/functions/_shared/serve-agent.ts
supabase/functions/_shared/hmac-success-coalescer.ts
supabase/functions/_shared/crypto-utils.ts  (timingSafeEqual source)
supabase/functions/__tests__/security-audit.test.ts
supabase/functions/heartbeat/__tests__/hmac-validator.test.ts
```

## Proibido mexer (recap do escopo)

- algoritmo HMAC / canonicalização / headers assinados
- janela de replay / `hmac_check_and_record`
- `timingSafeEqual` / `timingSafeHexCompare`
- `verifyHmacSignature` semantics / payload variants / fast-path / slow-path
- `logAuthFailure` (mensagens, severities, cache)
- `EdgeRuntime.waitUntil(dispatch())` semantics (apenas tipagem do `runtime`)
- coalescer PP02-A/B / `hmac_success_coalescing` flag
- success path / failure path / códigos `AUTH_*`
