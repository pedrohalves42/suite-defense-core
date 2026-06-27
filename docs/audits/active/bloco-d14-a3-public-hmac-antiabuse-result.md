# D14-A3 — Public / HMAC / Anti-abuse Cleanup

## Escopo
- `supabase/functions/submit-hmac-router/index.ts`
- `supabase/functions/honeypot-handler/index.ts`
- `supabase/functions/check-tenant-abuse/index.ts`

## Mudanças
- **submit-hmac-router**: removido `@ts-nocheck`. Zero patch — handlers já usam `supabase: any` em assinaturas. `deno check` limpo. Contrato HMAC, replay, rate limit e roteamento intactos.
- **honeypot-handler**: removido `@ts-nocheck`. Zero patch. Kill switch, attribution e contrato `honeypot_interactions` preservados. `deno check` limpo.
- **check-tenant-abuse**: removido `@ts-nocheck`. Exposto bug latente: a resposta referenciava `tenants?.length`, variável inexistente (após migração para RPC `get_tenant_abuse_metrics`), que dispararia `ReferenceError` em runtime. Corrigido para `alerts.length`, mantendo semântica do campo (quantidade de tenants em abuso detectados — único dado disponível pós-RPC). Demais lógicas (thresholds, persistência de alerts) intactas.

## Validação
- `deno check` PASS nos 3 alvos.
- Gate CI expandido para **48 arquivos** (`scripts/guard-no-ts-nocheck-tier1.sh` PASS).
- Nenhum consumer impactado (handlers em `_shared/submit-handlers/*` inalterados).

## Follow-ups
- `CHECK-TENANT-ABUSE-RESP-01` (baixo): considerar separar `tenants_checked` real (via segunda query) vs `alerts_created`. Não bloqueante.
- Mantidos: API-GATEWAY-DRIFT-01, AUDIT-CONTRACT-01, FIDO2-PUBKEY-TYPE-01, FIDO2-BODY-TYPE-01.

## Dívida ativa
- Antes: 88 diretivas `@ts-nocheck` fora de `_shared/`.
- Depois: **85**.
