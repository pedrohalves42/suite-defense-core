# P0-04 — Auth / MFA / Step-up · Before (Sprint 1A · Frente 1)

- Date: 2026-07-10
- Status: **Confirmed** (upgrade de `Needs Investigation`)
- Sprint: 1A
- Owner: Security Lead
- Mode: read-only (nenhum artefato de runtime alterado nesta frente)
- Depends on: P0-01 ✅ Closed, P0-02 ✅ Closed

---

## 1. Defeito localizado

### 1.1 Único ponto de "enforcement" server-side existente

`supabase/functions/api-gateway/handlers/honeypot.ts` — dois handlers,
mesma lógica:

```ts
// handleActivateAgentHoneypot — linhas 35-39
const stepUpVerified = ctx?.req?.headers.get('X-Step-Up-Verified');
if (stepUpVerified !== 'true') {
  return errRes('Step-up authentication required for honeypot activation', 403,
    { code: 'STEP_UP_REQUIRED' });
}

// handleRevertAgentHoneypot — linhas 116-120
const stepUpVerified = ctx?.req?.headers.get('X-Step-Up-Verified');
if (stepUpVerified !== 'true') {
  return errRes('Step-up authentication required for honeypot reversion', 403,
    { code: 'STEP_UP_REQUIRED' });
}
```

### 1.2 Por que isso é um bypass trivial

A "prova" de step-up é um header HTTP arbitrário controlado pelo
cliente. Um invocador com sessão AAL1 válida (login por senha, **sem**
MFA) contorna a exigência simplesmente enviando o header:

```bash
# PoC documental — não executar contra produção sem autorização
curl -X POST "https://<project>.functions.supabase.co/api-gateway" \
  -H "Authorization: Bearer <AAL1_JWT>" \
  -H "apikey: <ANON_KEY>" \
  -H "X-Step-Up-Verified: true" \
  -H "Content-Type: application/json" \
  -d '{
        "action": "security:activate-agent-honeypot",
        "payload": {
          "agent_id": "<agent_uuid_do_tenant>",
          "reason": "bypass demonstration"
        }
      }'
# Retorno esperado (defeito): 200 OK, honeypot ativado sem MFA
```

Grep no repositório confirma que **nem o próprio frontend envia esse
header** em nenhum lugar:

```text
$ rg -n "X-Step-Up" src/
(no matches)
```

Ou seja: o header nunca protegeu a rota em uso legítima (o cliente
oficial não o envia — o handler dependeria de comportamento nunca
implementado no cliente), e continua exposto a bypass por curl.

### 1.3 Sinal correlato no frontend

`src/hooks/useStepUpAuth.tsx` implementa uma janela local de 5min
(`lastVerifiedAt`) puramente client-side. Não há assinatura, não há
claim JWT verificada, não há transporte para o servidor. Toda a
"proteção" mora no state do React.

---

## 2. Endpoints destrutivos sem qualquer checagem AAL2

Enumeração baseada em `supabase/functions/api-gateway/index.ts`
(mapa `INLINED_HANDLERS` e `ACTION_TO_FUNCTION`). Cada linha abaixo
executa uma mutação sensível e **hoje aceita qualquer JWT válido,
AAL1 inclusive**, sem checar `aal`, `amr` ou frescor de fator.

| # | Action                                     | Handler / rota                          | Impacto                                   |
| - | ------------------------------------------ | --------------------------------------- | ----------------------------------------- |
| 1 | `security:activate-agent-honeypot`         | `handlers/honeypot.ts` (bypass header)  | Desvia agente para honeypot               |
| 2 | `security:revert-agent-honeypot`           | `handlers/honeypot.ts` (bypass header)  | Reverte agente do honeypot                |
| 3 | `admin:remove-member`                      | `handlers/admin.ts`                     | Remove usuário do tenant                  |
| 4 | `admin:update-user-role`                   | `handlers/admin.ts`                     | Escalação de privilégio                   |
| 5 | `admin:update-member-role`                 | `handlers/admin.ts`                     | Escalação de privilégio                   |
| 6 | `admin:update-user-status`                 | `handlers/admin.ts`                     | Suspende/ativa usuário                    |
| 7 | `admin:create-user`                        | `handlers/admin.ts`                     | Cria usuário privilegiado                 |
| 8 | `admin:delete-invite`                      | `handlers/admin-auth.ts`                | Remove convite pendente                   |
| 9 | `admin:change-password`                    | `handlers/user-auth.ts`                 | Troca de senha sem step-up                |
| 10 | `agent:token-rotate`                      | `handlers/agent-ops.ts`                 | Rotação de credencial de agente           |
| 11 | `agent:recover-agent-credentials`         | `handlers/agent-ops.ts`                 | Recuperação de credencial                 |
| 12 | `agent:force-reinstall-fleet` (proxied)   | `force-reinstall-fleet`                 | Reinstala frota inteira                   |
| 13 | `agent:create-reinstall-jobs` (proxied)   | `create-reinstall-jobs`                 | Enfileira reinstalação em massa           |
| 14 | `build:revoke-enrollment-key`             | `handlers/enrollment.ts`                | Revoga chave de enrollment                |
| 15 | `build:sign-release` (proxied)            | `sign-release`                          | Assina release de agente                  |
| 16 | Rollback de remediação                    | `handlers/security-threats.ts`          | Desfaz ação de remediação                 |

Handlers de kill-switch (P0-09) e MFA reset / break-glass
(`docs/procedures/mfa_reset_procedure.md`, `break_glass_procedure.md`)
serão auditados como itens 5 e 6 da Frente 2. Aqui os documentamos
como fora do escopo desta frente **de investigação**.

---

## 3. O que já existe e será reaproveitado

- `useTenantMFAPolicy` (client): política por tenant já retorna
  `require_mfa_all_users`, `require_mfa_roles` (default:
  `['admin', 'super_admin']`), `grace_exempt_roles`, break-glass.
  A Frente 2 usará a RPC `get_tenant_mfa_policy` do lado servidor.
- `is_break_glass_user` RPC: já existe e deve ser respeitada pelo
  helper `requireAAL2` (bypass legítimo, auditado).
- Tabela `fido2_credentials` (14 colunas, 4 policies) + integração
  Supabase MFA (`amr` + `aal` no JWT): fonte de verdade para step-up.

---

## 4. Guarda de freeze respeitada nesta frente

- 0 edge functions alteradas.
- 0 RPCs alteradas.
- 0 policies alteradas.
- 0 componentes de frontend alterados.
- Apenas leitura de código + atualização desta documentação.

---

## 5. Próximo passo

Iniciar Frente 2 (item 1): criar
`supabase/functions/_shared/auth/require-aal2.ts` e aplicar em
`handleActivateAgentHoneypot` + `handleRevertAgentHoneypot`
substituindo o header bypass. O `after.md` desta P0-04 documentará
o PoC repetido, agora esperando **403 STEP_UP_REQUIRED** para JWT
AAL1 e **200** para JWT AAL2 dentro da janela.
