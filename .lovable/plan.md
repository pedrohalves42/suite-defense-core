
# Fase 5: Consolidação de Funções servePublic

## Diagnóstico
Temos **19 funções servePublic** standalone. Elas NÃO usam JWT de tenant, então não podem ir para `api-gateway`/`ops-gateway`. Porém, a maioria compartilha o mesmo padrão: `servePublic(handler)`.

## Estratégia: Criar `public-gateway`

### Grupo A — Consolidáveis (~12 funções → 1 gateway)
Funções simples (1 arquivo, sem HMAC custom) que podem ser agrupadas:

| Função | Action no gateway |
|--------|-------------------|
| `approve-via-token` | `public:approve-via-token` |
| `check-failed-logins` | `public:check-failed-logins` |
| `evaluate-software-risk` | `public:evaluate-software-risk` |
| `get-diagnostic-script` | `public:get-diagnostic-script` |
| `get-latest-agent-script` | `public:get-latest-agent-script` |
| `get-reinstall-by-name` | `public:get-reinstall-by-name` |
| `get-reinstall-preserve-script` | `public:get-reinstall-preserve-script` |
| `get-reinstall-script` | `public:get-reinstall-script` |
| `health` | `public:health` |
| `record-failed-login` | `public:record-failed-login` |
| `submit-contact` | `public:submit-contact` |
| `track-installation-event` | `public:track-installation-event` |

### Grupo B — Manter standalone (~7 funções)
Funções com auth custom, verificação de assinatura ou multi-arquivo:

| Função | Razão |
|--------|-------|
| `validate-hmac-signature` | HMAC verification no raw body |
| `validate-invite` | Token-based auth custom |
| `verify-compliance-report` | Frontend calls diretos com lógica complexa |
| `verify-document` | Verificação de documento com lógica específica |
| `fido2-authenticate` | WebAuthn protocol - requer fluxo específico |
| `api-tenant-features/info/stats` | API-key auth separado |

## Etapas de Execução

1. **Criar `supabase/functions/public-gateway/index.ts`** — Router com dispatch por action, usando `servePublic`
2. **Criar handlers modulares** em `public-gateway/handlers/` (1 handler por domínio agrupando funções relacionadas)
3. **Atualizar `src/lib/gateway.ts`** — Adicionar namespace `public` apontando para `public-gateway`
4. **Migrar frontend** — Trocar `supabase.functions.invoke('check-failed-logins')` por `callGateway('public', 'check-failed-logins')`
5. **Validar** — `npx tsc --noEmit` + deploy + curl test
6. **Deletar standalone** — Remover diretórios e funções do Supabase

## Resultado Esperado
- **90 → ~78 standalone** (-12 funções)
- Menos cold starts para endpoints públicos
- Manutenção centralizada

## Validação
1. Zero erros TypeScript
2. Deploy do public-gateway
3. Curl test de cada action
4. Deletar standalone após validação
