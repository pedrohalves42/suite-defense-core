# Bloco D5 — submit-router/index.ts sem @ts-nocheck

## Escopo
- Arquivo: `supabase/functions/submit-router/index.ts`
- Objetivo: remover `@ts-nocheck` e tipar roteamento sem alterar runtime,
  contrato de agente, HMAC, persistência ou validação funcional.

## Mudanças
- Removido `// @ts-nocheck`.
- `HANDLERS` agora é `as const satisfies Record<string, SubmitHandler>`,
  preservando exatamente as mesmas chaves (kebab + snake) do mapa original.
- Introduzido `type SubmitKind = keyof typeof HANDLERS` e o type guard
  `isSubmitKind(value)`. Handler nunca é chamado com chave fora da allowlist.
- `body` (vindo como `unknown` de `serveAgent`) passa por narrowing para
  `Record<string, unknown>` antes da validação Zod.
- `validateSubmit` continua sendo a fonte de verdade da validação por tipo;
  o retorno é normalizado para `Record<string, unknown>` apenas para passar
  ao handler com o mesmo formato já esperado.
- `validationErr.message` substituído por narrowing
  (`instanceof Error ? err.message : String(err)`).
- `supabase` (tipado como `any` em `AgentContext` por contrato compartilhado)
  é repassado como `SupabaseClient` apenas na borda do handler. Tipo do
  `AgentContext` em `_shared/serve-agent.ts` não foi tocado.
- Mensagens de erro e códigos HTTP preservados: 400 para payload inválido,
  404 para tipo desconhecido.

## Não mexido
- `serve-tenant.ts`, `serve-agent.ts`, `agent-auth.ts`, `validateSubmit`,
  schemas, handlers individuais, HMAC, replay, persistência.
- Nenhuma rota nova, nenhum tipo de submit novo, nenhum handler novo.

## Smoke lógico
| Caso | Comportamento |
| --- | --- |
| payload válido conhecido | `validateSubmit` ok → handler correto via `HANDLERS[type]` |
| payload com tipo desconhecido | `isSubmitKind` falha → 404 controlado |
| payload malformado / sem `type` | Zod falha → 400 controlado |
| `validateSubmit` lança | mensagem capturada com narrowing → 400 |
| agente inválido | bloqueado em `serveAgent` antes do handler |
| logs | `logger.info` (sem `console.*`) |

## Validação
- `tsgo --noEmit`: 0 erros
- `bun run lint`: 0 erros (914 warnings pré-existentes)
- `scripts/bloco-c-gates.sh`: PASS (3/3)
- `ci/security_gate.sh`: requer `DATABASE_URL` — delegado ao CI

## Próximo
D6 — `poll-jobs/index.ts`.
