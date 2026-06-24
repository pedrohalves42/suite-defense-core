# D8-A — Remove @ts-nocheck from `supabase/functions/register-agent-key/index.ts`

## Status
✅ Concluído — typecheck, lint e bloco-c gates passam.

## Escopo
- Removido `// @ts-nocheck`.
- `ctx.supabase` (typed `any` em `AgentContext`) é estreitado localmente para
  `SupabaseClient<Database>`. Contrato público de `serveAgent` inalterado.
- `rawPayload` mantém-se `unknown` (vindo de `AgentContext.body`) e só é usado
  via `RegisterKeySchema.safeParse`.
- Orphan key list tipado como `OrphanKeyRow[]` via `as unknown as` — substitui
  os antigos `Record<string, string>` no sort/map.
- Resultado do RPC `register_agent_signing_key` tipado como
  `RegisterKeyRpcRow` (com narrowing `Array.isArray` mantendo o fallback
  `registerResult[0] || registerResult` original).

## Não-mudou (verificado)
- HMAC + replay (`hmacVerify: true`) intacto.
- Rate limit: `maxRequests: 5`, `windowMinutes: 10`, `blockMinutes: 30`.
- Geração/validação de fingerprint (`computeAllKeyFingerprints`) intacta.
- Mensagens, status codes (400/409/500/201) e payloads de resposta idênticos.
- Tabela `agent_signing_keys`, RPC `register_agent_signing_key`, RLS,
  migrations: não tocados.
- `serve-agent-update` e `confirm-force-update`: não tocados.
- Logs: nenhum segredo novo (`hmac_secret`, `token`, `token_hash`,
  `public_key` bruto) adicionado a `logger.info/warn/error`.

## Smoke lógico
| Caso                          | Esperado                          | Status |
| ----------------------------- | --------------------------------- | -----: |
| registro válido               | 201 + key_id + version            |     ✅ |
| fingerprint não bate          | 400 + security_event logged       |     ✅ |
| chave já registrada (ativa)   | 200 + already_registered          |     ✅ |
| chave previamente revogada    | 409                               |     ✅ |
| payload Zod inválido          | 400 + issues                      |     ✅ |
| HMAC inválido/replay          | bloqueado antes do handler        |     ✅ |
| rate limit excedido           | 429 com Retry-After               |     ✅ |
| RPC falha                     | 500 + details                     |     ✅ |

## Gates
- `tsgo --noEmit`: ✅ 0 errors
- `bun run lint`: ✅ 0 errors (914 warnings pré-existentes)
- `bash scripts/bloco-c-gates.sh`: ✅ PASS (3/3)
- `bash ci/security_gate.sh`: ⏳ requer `DATABASE_URL` — delegado ao CI.

## Próximo
**D8-B — `serve-agent-update/index.ts`**.
