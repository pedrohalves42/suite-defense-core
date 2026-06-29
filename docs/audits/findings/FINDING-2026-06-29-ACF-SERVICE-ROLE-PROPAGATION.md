# FINDING-2026-06-29-ACF-SERVICE-ROLE-PROPAGATION

**Componente:** `supabase/functions/action-center-feed/index.ts`
**Severidade:** P0
**Status:** Fixed (Sprint 1, 2026-06-29)
**Categoria:** Credential propagation / privilege escalation risk

---

## Hipótese inicial (do scanner)

> "`action-center-feed` permite bypass completo de RLS para qualquer usuário autenticado."

## Confirmado pela investigação

A narrativa de "bypass de RLS direto" **não se sustenta**. O `userClient` é usado
exclusivamente para `functions.invoke(...)` de três Edge Functions downstream
(`execute-playbook-action`, `auto-remediate`, `ai-router`) — nunca para
`.from(...)` queries. Todas as queries de tabela do handler usam `serviceClient`
com `tenantId` derivado do JWT validado pelo middleware `serveTenant`.

O risco real é diferente e mais sutil:

> Propagação da credencial `SUPABASE_SERVICE_ROLE_KEY` como header `apikey`
> em invocações downstream. Se qualquer função downstream confiar no `apikey`
> recebido para autorizar privilégios (ou criar clients a partir dele), o
> resultado é escalada de privilégio efetiva.

A verificação independente em `serveTenant` (linhas 143–203 de
`_shared/serve-tenant.ts`) confirmou que as três funções downstream autenticam
exclusivamente pelo header `Authorization: Bearer <JWT>` e **não consultam** o
`apikey`. Portanto não há exploração ativa conhecida — mas a configuração viola
o princípio do menor privilégio e é uma armadilha latente.

## Correção aplicada

`index.ts:62-74` — `userClient` passou a usar `SUPABASE_ANON_KEY` em vez de
`SUPABASE_SERVICE_ROLE_KEY`. Comentário institucional inline impede regressão.

## Critério de aceite

- [x] `deno check` limpo no arquivo alterado.
- [x] Downstream functions (`execute-playbook-action`, `auto-remediate`,
      `ai-router`) confirmadas autenticando via `serveTenant` →
      `supabase.auth.getUser(token)`, independente do `apikey`.
- [x] Severidade reclassificada de "RLS bypass" para "credential propagation".

## Lição

Cliente downstream forwardando JWT do usuário **nunca** deve carregar
service-role como `apikey`. A regra correta é `ANON_KEY + Authorization: Bearer
<user_jwt>`. Service-role só é aceitável em clients usados para operações
estritamente administrativas no próprio escopo da função.
