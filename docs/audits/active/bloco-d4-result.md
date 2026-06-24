# Bloco D4 — Remoção de `@ts-nocheck` de `submit-job-result/index.ts`

## Status
✅ Concluído

## Objetivo
Tirar o orquestrador de conclusão de job do modo "caixa-preta" do TypeScript,
sem alterar nenhum comportamento de runtime. O caminho protegido é:

```
agent → submit-job-result → jobs.output.evidence_hash
       → trigger trg_enforce_critical_job_evidence
       → evidence logs
```

Esse arquivo toca direto no que foi blindado por S-P0.5 / S-P0.5b, então o
tipo deixou de ser "informativo" e passou a ser barreira real contra
regressões em `evidence_hash`, transição de status e contrato com o agente.

## Escopo
- Removido `// @ts-nocheck` de `supabase/functions/submit-job-result/index.ts`.
- Tipagem alinhada à D1 (`AgentExtraField` allowlist) e ao `SubmitContext`
  já existente em `submit-job-result/types.ts`.
- Nenhum outro módulo de `submit-job-result/` foi tocado.

## Arquivos alterados
- `supabase/functions/submit-job-result/index.ts`
  - `@ts-nocheck` removido.
  - `supabase: any` substituído por `SupabaseClient<Database>` (narrowing
    local; o tipo público de `serveAgent` ainda é `any` por compatibilidade,
    o cast é único e isolado).
  - `ctx.hmacSecret || ''` trocado por `?? ''` (sem mudança semântica:
    `hmac_secret` no contexto é `string | null`).
  - `agentData.agent_version` lido via narrowing (`typeof === 'string' && len > 0`)
    em vez de `as string | null`, eliminando assert direto sobre `unknown`.
  - `rawPayload` validado como objeto antes de passar para
    `validateAndParsePayload`, em vez de `as Record<string, unknown>` cego.
  - Cast redundante `(validation as { success: false; response: Response })`
    removido — o discriminated union já cobre.
  - `extraAgentFields: ['agent_version'] as const` para preservar o
    literal type e fazer a allowlist `AgentExtraField` valer no call site.

## Não tocados (proibido por escopo)
- `supabase/functions/submit-job-result/validation.ts`
- `supabase/functions/submit-job-result/security.ts`
- `supabase/functions/submit-job-result/execution.ts`
- `supabase/functions/submit-job-result/post-completion.ts`
- `supabase/functions/submit-job-result/side-effects/**`
- `supabase/functions/submit-job-result/types.ts`
- `supabase/functions/_shared/serve-agent.ts`
- `supabase/functions/_shared/agent-auth.ts`
- `supabase/functions/_shared/hmac.ts`
- Schemas, RPCs, RLS, triggers (`trg_enforce_critical_job_evidence`)

## Runtime inalterado — invariantes preservadas

| Caso                                  | Esperado                                | Status |
|---------------------------------------|-----------------------------------------|-------:|
| job válido com resultado              | `completed` + `output.evidence_hash`    | inalterado |
| job crítico sem evidência             | bloqueado pela trigger                  | inalterado |
| job inexistente                       | 404 controlado                          | inalterado |
| agente errado / tenant errado         | bloqueado em `checkJobOwnership`        | inalterado |
| payload inválido                      | 400 validado (Zod)                      | inalterado |
| replay / auth inválido                | rejeitado no `serveAgent` antes do handler | inalterado |
| side-effect falha                     | `SIDE_EFFECT_FAILURE` 500 + job não fecha | inalterado |
| `evidence_hash` SHA-256 determinístico| mesmo payload, mesmo algoritmo          | inalterado |
| pós-completion (governance / report / dns) | continuam não-bloqueantes          | inalterado |

Nenhuma alteração em: HMAC, replay, RPC, contrato do agente, side-effects,
ordem de execução (zero-trust mantido: side-effects antes do `update`).

## Gates executados

| Gate                              | Resultado |
|-----------------------------------|----------:|
| `bunx tsgo --noEmit`              | ✅ 0 erros |
| `bun run lint`                    | ✅ 0 erros (914 warnings preexistentes) |
| `bash scripts/bloco-c-gates.sh`   | ✅ PASS (3/3) |
| `bash ci/security_gate.sh`        | ⏭️ requer `DATABASE_URL` — delegado ao CI |

## Regressões agora bloqueadas em typecheck
- Setar `metadata_hash`, `hmac_secret` ou qualquer coluna fora da allowlist
  em `extraAgentFields` → falha (via `AgentExtraField`, herança D1/D-FOLLOWUP-01).
- Trocar `evidence_hash` por `unknown` no `outputWithEvidence` sem narrowing.
- Passar `validation.response` quando `success: true` (discriminated union).
- Tratar `agentData.agent_version` como string sem checagem.

## Riscos residuais
- `serveAgent` ainda expõe `supabase: any` no `AgentContext`. O cast para
  `SupabaseClient<Database>` é seguro porque o cliente é criado com
  `createClient<any>` no próprio `serveAgent`, mas o ideal é tipar lá
  (PR futura — provavelmente junto à remoção de `@ts-nocheck` de
  `_shared/serve-agent.ts`).
- `updateData: Record<string, unknown>` no orquestrador é intencional: o
  shape final do update de `jobs` mistura colunas opcionais e a coluna
  `output` é jsonb. Tipar isso exige tocar nos módulos vizinhos
  (`validateGovernance` recebe o mesmo shape) — fora do escopo D4.

## Próximo alvo recomendado
**D5 — `supabase/functions/submit-router/index.ts`**
Mesmo padrão: serve-agent + HMAC + roteamento para `submit-job-result`,
mas com menos superfície que `submit-job-result`. Bom próximo passo antes
de `poll-jobs` (D6) e `ack-job` (D7).
