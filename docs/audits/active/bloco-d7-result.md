# D7 — Remove @ts-nocheck from `supabase/functions/ack-job/index.ts`

## Status
✅ Concluído — typecheck, lint e bloco-c gates passam.

## Escopo
- Removido `// @ts-nocheck` de `supabase/functions/ack-job/index.ts`.
- `ctx.supabase` (typed `any` no `AgentContext`) é estreitado localmente para
  `SupabaseClient<Database>` na primeira linha do handler, sem alterar o
  contrato público de `serveAgent`.
- Job consultado tipado como `Pick<JobRow, ...>` derivado de
  `Database['public']['Tables']['jobs']['Row']` via `.maybeSingle<AckJob>()`.
- `CRITICAL_JOB_TYPES` virou `as const` e o `.includes` usa
  `readonly string[]` para preservar o `403` original sem `as any`.
- Extração do `job_id` do body usa type guard `isRecord(unknown)` + checagem
  `typeof === 'string'`, substituindo o antigo `(body as Record<string,unknown>).job_id as string`.
- `statusBefore` tipado explicitamente como `string` (status no schema é
  string).

## Não-mudou (proibido alterar — verificado)
- Bloqueio 403 de jobs críticos (`CRITICAL_JOB_TYPES`): mensagem, status e
  códigos preservados (`INTEGRITY_VIOLATION`).
- HMAC + replay: `hmacVerify: true` mantido em `serveAgent` options.
- Rate limit: `{ endpoint: 'ack-job', maxRequests: 60, windowMinutes: 1, blockMinutes: 5 }`.
- Evidence hash: mesmo payload determinístico, mesma serialização JSON,
  mesmo SHA-256, mesmo `agent_evidence_logs.insert` (event_type
  `job_ack_legacy`, severity `info`, trace_id `requestId`).
- Idempotência (`status === 'completed'`) e mensagens de retorno preservadas.
- Validação `JobIdSchema` preservada.
- Verificação `agent_name` preservada (403 "Job pertence a outro agente").
- Mensagens em PT mantidas (acento original preservado).
- `submit-job-result`, `agent-auth.ts`, `serve-agent.ts`, RLS, RPC, migrations,
  trigger DB e contrato do agente: não tocados.

## Smoke lógico
| Caso                      | Esperado                       | Status |
| ------------------------- | ------------------------------ | -----: |
| job não crítico           | ack normal funciona            |     ✅ |
| job crítico via `ack-job` | 403 INTEGRITY_VIOLATION        |     ✅ |
| job inexistente           | 404 "Job nao encontrado"       |     ✅ |
| agent errado              | 403 "Job pertence a outro..."  |     ✅ |
| payload inválido          | 400 "Formato de job ID..."     |     ✅ |
| HMAC inválido/replay      | bloqueado antes do handler     |     ✅ |
| evidence log              | hash + insert idênticos        |     ✅ |
| idempotência              | retorno `ja estava confirmado` |     ✅ |

## Gates
- `tsgo --noEmit`: ✅ 0 errors
- `bun run lint`: ✅ 0 errors (914 warnings pré-existentes)
- `bash scripts/bloco-c-gates.sh`: ✅ PASS (3/3)
- `bash ci/security_gate.sh`: ⏳ requer `DATABASE_URL` — delegado ao CI.

## Próximo
**D8 — `register-agent-key` / `serve-agent-update` / `confirm-force-update`**
(cadeia de identidade/update do agente).
