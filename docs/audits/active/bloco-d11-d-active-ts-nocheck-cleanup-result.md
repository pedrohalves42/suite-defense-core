# Bloco D11-D — Active @ts-nocheck Cleanup Result

**Status:** ✅ Concluído
**Escopo:** type-only, runtime/contrato preservados

## Arquivos alterados

| # | Arquivo | @ts-nocheck removido | deno check |
|---|---------|----------------------|------------|
| D11-D1 | `supabase/functions/register-agent-key/fingerprint-utils.ts` | ✅ | ✅ |
| D11-D2 | `supabase/functions/public-gateway/handlers/fido2-auth.ts`   | ✅ | ✅ |
| D11-D3 | `supabase/functions/public-gateway/handlers/software-risk.ts` | ✅ | ✅ |

## Erros encontrados e correções (type-only)

### D11-D1 — fingerprint-utils.ts
- **TS2345** em `crypto.subtle.digest('SHA-256', bytes)` — `Uint8Array<ArrayBufferLike>` não atribuível a `BufferSource` (mismatch lib Deno/DOM).
- **Fix:** cópia para `Uint8Array` fresco e uso de `.buffer` (`ArrayBuffer` puro). **Bytes idênticos**, sem alteração de hash/canonicalização/normalização.
- Sem mudança em fingerprint format, comparação, rate-limit binding.

### D11-D2 — fido2-auth.ts
- **TS7006** (×2) `Parameter 'u' implicitly has an 'any' type` em `users?.find(u => u.email === email)`.
- **Fix:** annotation local `(u: { email?: string | null }) => u.email === email`. Sem alteração em challenge, origin, rpId, credentialId, counter, attestation, user/tenant binding, status codes ou mensagens.

### D11-D3 — software-risk.ts
- Sem erros após remoção do `@ts-nocheck` (tipagens locais `VulnerabilityBaseline`/`SoftwareRisk` já presentes).
- Sem alteração em risk score, severity mapping, classificação, tenant filtering, query shape ou response JSON.

## Smoke / Checks executados

```bash
deno check supabase/functions/register-agent-key/fingerprint-utils.ts \
           supabase/functions/public-gateway/handlers/fido2-auth.ts \
           supabase/functions/public-gateway/handlers/software-risk.ts
# → PASS (Found 0 errors)

deno check supabase/functions/register-agent-key/index.ts \
           supabase/functions/public-gateway/index.ts
# → PASS (consumers limpos)

rg -n '^\s*(//|/\*)\s*@ts-nocheck\b' supabase/functions/register-agent-key supabase/functions/public-gateway
# → 0 ocorrências
```

## Runtime preservado

- ❌ Nenhuma mudança em payload, status codes, mensagens públicas, hashing, autenticação, score de risco, queries, RPC ou migrations.
- ❌ Nenhum `as any` ou cast amplo (apenas annotation de parâmetro e cópia de buffer).
- ✅ Insert/select shapes intactos.

## Diretivas ativas restantes (escopo D11-D)

```
supabase/functions/register-agent-key/*  → 0
supabase/functions/public-gateway/**     → 0
```

## Riscos residuais

- Os dois espelhos de `database.types.ts` (`src/integrations/supabase/types.ts` e `supabase/functions/_shared/database.types.ts`) seguem separados — herdado de D11-B, fora de escopo aqui.
- 107 diretivas ativas ainda existem em outras subpastas de `supabase/functions/` (inventário D10 v2) — alvos futuros do D11-E+.

## Próximo alvo

**D11-E — gate CI anti-regressão**: adicionar workflow que executa o scanner D10 v2 e falha PRs que reintroduzam `@ts-nocheck` ativo nas pastas já saneadas (`_shared/`, `heartbeat/`, `poll-jobs/`, `register-agent-key/`, `public-gateway/`).
