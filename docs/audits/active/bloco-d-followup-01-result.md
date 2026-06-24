# D-FOLLOWUP-01 — `AgentExtraField` explicit allowlist

## Escopo
Arquivo único: `supabase/functions/_shared/agent-auth.ts`.
Sem mudança de runtime, RLS, RPC ou contrato HTTP.

## Mudança
Antes:
```ts
export type AgentExtraField = Exclude<keyof AgentRow, AgentBaseField>;
```
Permitia qualquer coluna real de `agents`, inclusive sensíveis (`hmac_secret`,
`result_public_key`, `payload_hash`, `metadata_hash` se voltasse).

Depois:
```ts
type SafeAgentExtraField =
  | 'agent_name' | 'agent_version' | 'hostname' | 'os_type' | 'os_version'
  | 'state' | 'agent_state' | 'ed25519_supported' | 'signature_mode'
  | 'skip_firewall_remediation'
  | 'last_heartbeat' | 'last_telemetry_at'
  | 'force_update_version' | 'force_update_reason' | 'force_update_at'
  | 'force_update_override_safe_mode'
  | 'force_update_override_safe_mode_expires_at'
  | 'force_update_delivered_count' | 'force_update_delivery_count'
  | 'force_update_first_delivered_at' | 'last_forced_update_applied';

export type AgentExtraField = Extract<keyof AgentRow, SafeAgentExtraField>;
```

`Extract<...>` preserva o guard D1: typo ou coluna removida continua falhando
no typecheck. `SafeAgentExtraField` adiciona o guard de contrato: campo
existente porém sensível não compila mais.

## Cobertura
Cobre os usos atuais em todas as edge functions auditadas
(`heartbeat`, `serve-agent-update`, `confirm-force-update`,
`check-agent-updates`, `get-agent-policy`, `get-blocked-websites`,
`post-installation-telemetry`, `submit-hmac-router`, `submit-job-result`).
Nenhum call site precisou ser alterado.

## Critérios — atendidos
| Caso                       | Resultado                |
| -------------------------- | ------------------------ |
| `hmac_secret`              | ❌ não compila            |
| `result_public_key`        | ❌ não compila            |
| `payload_hash`             | ❌ não compila            |
| `metadata_hash`            | ❌ não compila            |
| coluna inexistente         | ❌ não compila (via D1)   |
| campos seguros atuais      | ✅ compilam               |
| runtime / RLS / contrato   | ✅ inalterados            |

Verificação negativa feita com `deno check` em arquivo isolado usando
`@ts-expect-error` em cada campo proibido (nenhum `@ts-expect-error` ficou
ocioso).

## Gates
- `tsgo --noEmit` ✅
- `bun run lint` ✅ (0 errors)
- `scripts/bloco-c-gates.sh` ✅
- `scripts/bloco-b-lint.sql` ✅ (estado preservado)

## Observação para D3
`recordTokenFailure` ainda usa `.then(...).catch(...)` sobre o builder
PostgREST, que é `PromiseLike` (sem `.catch`). Não afeta este PR
(edge functions estão fora do `tsgo` do projeto) mas é um item conhecido
a tratar quando o `@ts-nocheck` do `heartbeat/index.ts` for removido no D3.

## Próximo
`D-FOLLOWUP-02` — corrigir chaves órfãs em `heartbeat/types.ts`.
