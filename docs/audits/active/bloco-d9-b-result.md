# D9-B — Remaining `serve-*` edge functions typed

## Status
✅ `@ts-nocheck` removed
✅ `bunx tsgo --noEmit` — 0 errors
✅ `bun run lint` — 0 errors (warnings pré-existentes)
✅ `bash scripts/bloco-c-gates.sh` — PASS (3/3)
⏳ `ci/security_gate.sh` / `bloco-b-lint` — delegados ao CI (sem mudança em DB)

## Escopo
Restavam apenas dois `serve-*` com `@ts-nocheck` após D8:
- `supabase/functions/serve-installer/index.ts` (18 linhas, `servePublic`)
- `supabase/functions/serve-dns-filter/index.ts` (70 linhas, `serveAgent` + HMAC)

Os demais `serve-*` foram fechados antes:
- `serve-agent-update` → D8-B
- `serve-agent.ts` (shared) → D1

## Mudanças
### `serve-installer/index.ts`
- Removido `// @ts-nocheck`.
- Importado `SupabaseClient` + `Database`; `ctx.supabase` é estreitado
  localmente para `SupabaseClient<Database>` antes do `handleServeInstaller`.
- `payload: Record<string, string>` já era explícito — mantido.
- Sem mudança no parsing de `enrollmentKey`, `mode`, `hostname`, `os_type`.

### `serve-dns-filter/index.ts`
- Removido `// @ts-nocheck`.
- `ctx.supabase` estreitado para `SupabaseClient<Database>` (deixa de vir
  diretamente do destructuring para não conflitar com o tipo `any` em
  `AgentContext`).
- Demais variáveis (`agentName`, `tenantId`, `requestId`) seguem do
  destructuring original.

## Preservado (runtime intacto)
### serve-installer
- Rota `servePublic` sem alteração (sem JWT, mesmo rate-limit padrão herdado).
- Payload entregue ao `handleServeInstaller` idêntico (mesma ordem, mesmas keys
  condicionais para `hostname` / `os_type`).

### serve-dns-filter
- `hmacVerify: true` preservado.
- Tabelas consultadas: `tenant_settings`, `dns_filter_policies`,
  `blocked_websites` — nenhuma alteração de filtro ou colunas.
- Status codes e shapes preservados (403 quando DNS filter desabilitado; 200
  com `{ domains, count, config, served_at }`).
- Config hardcoded de DNS (`listen_addr`, `upstream_dns`, `fallback_dns`)
  intacta.
- Logs (`logger.info`/`warn`) sem novos campos sensíveis.
- Try/catch best-effort em ambas as queries preservado (resposta nunca falha
  por erro de leitura nas duas tabelas auxiliares).

## Não-mudou (verificado)
- Nenhum handler em `_shared/handlers/installer.ts` tocado.
- Sem alteração em RLS, RPC, migrations, storage, feature flags.
- Sem alteração em HMAC/replay/rate limit.

## Smoke lógico
| Caso | Esperado | Status |
|---|---|---|
| serve-installer GET com `enrollmentKey` válida | handler resolve normalmente | preservado |
| serve-installer sem `enrollmentKey` | handler decide (string vazia, comportamento atual) | preservado |
| serve-dns-filter sem HMAC válido | bloqueado por `serveAgent` middleware | preservado |
| serve-dns-filter tenant sem flag | 403 com `enabled:false` | preservado |
| serve-dns-filter tenant habilitado | 200 com `domains[]` agregado | preservado |
| falha em `dns_filter_policies` | log warn + segue para `blocked_websites` | preservado |
| falha em `blocked_websites` | log warn + retorna o que tiver | preservado |

## Riscos residuais
- `AgentContext.supabase` e `PublicContext.supabase` seguem como `any` na
  assinatura pública — narrowing aplicado por handler (mesma decisão de D8).
  Refatorar exige tocar todas as funções de agente/públicas.
- `serve-dns-filter` ainda usa cast `(site as { domain_pattern?: string })`
  inline — pré-existente, sem alteração.

## Próximo
**D9-C — `stripe-webhook/index.ts`** (próximo alvo da sequência D9), seguido de
**D9-D — `saml-sso` / `scim-provisioning`**. Mesma regra: PR pequena, typecheck
real, zero mudança funcional.
