# D9-D1 — saml-sso/index.ts

**Status:** ✅ PASS  
**Escopo:** `supabase/functions/saml-sso/index.ts`

## Mudanças aplicadas

- Removido `// @ts-nocheck`.
- Importados `SupabaseClient`, `User`, `Database`; cast tipado do client repassado por `servePublic`.
- `users?.find` tipado com `User`; `user` declarado como `User | undefined`.
- `newUser.user ?? undefined` (compat com retorno tipado do admin API).
- `audit_logs.insert(...).catch(...)` envolvido em `Promise.resolve(...).catch(...)` (PostgrestBuilder é PromiseLike, sem `.catch` no tipo) — runtime equivalente.
- Cast pontual `unknown as { onConflict; merge }` no insert em `user_roles` para preservar o encadeamento legado.

## Runtime preservado

- ✅ Schema Zod (`SamlSchema`) inalterado — mesmas ações, mesmos limites.
- ✅ Metadata XML inalterado (SP_ENTITY_ID / ACS_URL).
- ✅ Login: mesmo `AuthnRequest`, mesmo `RelayState=tenantId`, mesmo TTL de 10min em `session_store`.
- ✅ ACS: mesma extração via regex, mesma derivação de role por grupos, mesma criação de usuário, mesmo `generateLink('magiclink')`, mesmo `redirect_url` para `DASHBOARD_URL`.
- ✅ Configure: mesma checagem de Authorization, mesmo upsert em `saml_configs`, mesmo `audit_logs`.
- ✅ Config (GET): mesmo `maybeSingle` retornando `{ enabled: false }` quando ausente.
- ✅ Status codes preservados (400 / 401 / 500).
- ✅ Rate limit preservado (`saml-sso`, 20 req/min).

## Validações SAML preservadas

- Issuer / ACS URL / NameIDFormat inalterados.
- RelayState lido como `tenantId` (mesma semântica anterior).
- Lookup `saml_configs` continua exigindo `enabled = true`.
- Nenhuma mudança em assinatura, audience, clock skew, ou mapeamento de atributos.

## Logs

Sem dump de `SAMLResponse`, assertion, NameID ou certificado. Apenas:
- `[saml-sso] Login initiated for tenant {tenantId}`
- `[saml-sso] ACS: user {email} authenticated via SAML`
- erros via `handleException` / `logger.error`.

## Gates

- `bash scripts/bloco-c-gates.sh` → PASS
- `rg @ts-nocheck supabase/functions/saml-sso/` → 0

## Riscos residuais

1. **`.onConflict().merge()` legado** em `user_roles` — API não suportada pelo `supabase-js@2`. Atualmente preservada via cast; candidata a **D9-D1-FOLLOWUP** trocando para `.upsert(..., { onConflict: 'user_id,tenant_id' })`.
2. **Parse SAML via regex** (não XML DSig) é preexistente e fora do escopo desta PR.
3. **Validação de assinatura XML** ausente neste código (delegada ao IdP/operacional) — preexistente, fora do escopo D9-D1.

## Próximo alvo

`D9-D2 — scim-provisioning/index.ts` (PR separada, conforme orientação).
