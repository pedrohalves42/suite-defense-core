# FINDING-2026-06-29-RRT-PUBLIC-SERVICE-ROLE

**Componente:** `supabase/functions/run-rls-tests/index.ts`
**Severidade:** P0
**Status:** Fixed (Sprint 1, 2026-06-29)
**Categoria:** Public service-role endpoint / missing authz

---

## Hipótese inicial (do scanner)

> "Endpoint público com `service_role` e CORS `*` permite enumeração cross-tenant
> e escrita anônima em `rls_test_results`."

## Confirmado pela investigação

A função **realmente**:

- Aceitava qualquer requisição (sem `verify_jwt`, sem checagem de auth no código).
- Criava client com `SUPABASE_SERVICE_ROLE_KEY` antes de qualquer validação.
- Retornava `Access-Control-Allow-Origin: *`.
- Inseria em `rls_test_results` sem autorização.

## Refinado pela investigação

A função **não pode ser removida** — possui consumidores legítimos em
produção:

- `src/components/security/SecurityControlPlane/useSecurityControlPlane.ts`
  (botão admin "Verificar RLS").
- `src/components/security/RLSTestRunner.tsx`.
- Specs E2E em `e2e/security-control-plane.spec.ts` e `e2e/rls-automated-tests.spec.ts`.

Portanto **Cenário B** (hardening, não remoção).

## Correção aplicada

`index.ts` reescrito com:

1. **JWT obrigatório.** Sem `Authorization: Bearer ...` → 401.
2. **Authorização explícita** via `has_role(user_id, 'super_admin')`. Sem o
   papel → 403 + audit log de tentativa não autorizada.
3. **CORS restrito** a um allowlist fechado (preview, published, custom domain
   e localhost). `*` não é mais aceito.
4. **Service-role client criado SOMENTE após** a checagem 1+2.
5. **Audit log** em `security_logs` para cada execução
   (`rls_test_executed`), cada tentativa negada (`rls_test_unauthorized`) e
   cada falha (`rls_test_failure`) — incluindo `user_id`, `user_email`,
   `ip_address`, `test_run_id` e resultado.

## Critério de aceite

- [x] `deno check` limpo no arquivo alterado.
- [x] CORS deixa de aceitar `*` — restrito a allowlist conhecido.
- [x] Authn (JWT) e Authz (`super_admin`) precedem qualquer uso de service-role.
- [x] Audit log emitido para cada execução autorizada e cada tentativa negada.
- [ ] Teste positivo (`super_admin` executa) e negativo (usuário comum → 403):
      a validar via E2E existente após deploy.

## Lição

Edge Function que precisa de `service_role` para sua missão fim deve criar o
client **somente após** authn+authz. Construir o client antes — "porque a gente
precisa de qualquer jeito" — é um anti-pattern que transforma qualquer bug
posterior em escalada de privilégio.
