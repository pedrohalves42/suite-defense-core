# HF-RPC-OVERLOAD-AUDIT-01 — Eliminação da ambiguidade de overload em `has_role`

**Data:** 2026-07-01
**Escopo:** Banco (função `public.has_role`), 4 policies RLS, 1 caller em Edge Function, guarda de regressão em CI.
**Tipo:** Hotfix defensivo (elimina uma classe de bug).
**Precedente:** Bug PGRST203 descoberto na Sprint 1 (ACF `has_role` + tenant nulo).

---

## 1. Contexto

Durante a Sprint 1 (E2E do `run-rls-tests`) descobrimos que chamadas à RPC
`has_role(_user_id, _role)` podiam falhar silenciosamente com PGRST203
("Could not choose the best candidate function"), fazendo com que qualquer
`super_admin` fosse tratado como usuário comum e recebesse 403.

Causa raiz: **duas overloads que se sobrepõem em aridade**.

```
has_role(_user_id uuid, _role app_role)                              -- global
has_role(_user_id uuid, _role text, _tenant_id uuid DEFAULT NULL)    -- por tenant
```

Como o `_tenant_id` tinha `DEFAULT NULL`, uma requisição PostgREST enviando
apenas `{_user_id, _role}` era candidata para **as duas** assinaturas.
PostgREST se recusa a escolher e devolve PGRST203.

## 2. Correção aplicada

### 2.1 Banco

- **Removido** o `DEFAULT NULL` do parâmetro `_tenant_id` na variante de 3
  argumentos. Postgres não permite alterar defaults via `CREATE OR REPLACE`,
  então foi necessário `DROP` + `CREATE`.
- **Recriadas** as 4 policies que dependiam da função:
  - `storage.objects` → `admins_can_upload_agent_scripts_isolated`
  - `storage.objects` → `admins_can_delete_own_installers`
  - `storage.objects` → `admins_can_delete_own_scripts`
  - `public.pp02b_canary_snapshots` → `super_admin read pp02b_canary_snapshots`
- A policy `super_admin read pp02b_canary_snapshots` estava usando a forma
  `has_role(auth.uid(), 'super_admin'::text)` — ou seja, dependia
  implicitamente do default nulo. Foi ajustada para
  `has_role(auth.uid(), 'super_admin'::app_role)`, consistente com o restante
  das policies de super admin.
- Reconcedido `EXECUTE` para `authenticated` e `service_role`.

### 2.2 Callers TypeScript

Auditoria de todas as 13 chamadas via `supabase.rpc('has_role', ...)`:

| Arquivo | Argumentos | Estado após HF |
|---|---|---|
| `src/components/auth/useLoginFlow.ts` (x2) | 2 args | ✅ resolve na variante global |
| `src/pages/admin/MFASetupRequired.tsx` (x2) | 2 args | ✅ resolve na variante global |
| `supabase/functions/api-gateway/handlers/job-mgmt.ts` (x2) | 2 args | ✅ resolve na variante global |
| `supabase/functions/api-gateway/handlers/billing-stripe.ts` (x3) | 2 args | ✅ resolve na variante global |
| `supabase/functions/api-gateway/handlers/admin.ts:57` | 3 args (com `null` explícito) | ✅ |
| `supabase/functions/api-gateway/handlers/admin.ts:101` | 3 args (**`ctx?.tenantId` sem coalesce**) | 🔧 **corrigido** — agora `ctx?.tenantId ?? null` |
| `supabase/functions/api-gateway/handlers/admin-auth.ts:110` | 3 args | ✅ |
| `supabase/functions/get-agent-script-content/index.ts:34` | 2 args | ✅ resolve na variante global |

Só uma chamada precisou de mudança de código; as demais já estavam corretas
em termos de aridade e agora resolvem sem ambiguidade.

### 2.3 Guarda de regressão

Novo teste SQL: `tools/tests/assert_has_role_no_overload_ambiguity.sql`.

Falha (e portanto quebra o pipeline) se:

- alguma das duas overloads deixar de existir;
- surgir uma terceira overload com a mesma aridade;
- qualquer overload de `has_role` reintroduzir um parâmetro com default
  (que é exatamente o padrão que causou o PGRST203).

## 3. Impacto

- **Comportamento observável:** inalterado. Todas as combinações válidas
  continuam retornando os mesmos resultados. RLS, storage e Edge Functions
  não requerem mudança de contrato.
- **Superfície de falha eliminada:** a classe inteira de PGRST203 sobre
  `has_role` fica impossível enquanto o guard estiver ativo.
- **Custo de manutenção:** próximo de zero. Novos callers 3-arg precisam
  passar `_tenant_id` explicitamente (padrão desejado).

## 4. Validação

- Migração aplicada com sucesso (o bloco `DO $$ ... $$` de auto-verificação
  embutido na migração passou).
- Overloads no banco após o hotfix:
  - `has_role(_user_id uuid, _role app_role) → boolean`
  - `has_role(_user_id uuid, _role text, _tenant_id uuid) → boolean` (sem defaults)
- Guarda `assert_has_role_no_overload_ambiguity.sql` deve ser executado no
  pipeline de migrações e na job `security-checks`.

## 5. Follow-up recomendado

- Rodar a spec `e2e/sprint1-run-rls-tests-authz.spec.ts` no próximo pipeline
  para confirmar que o cenário 200/super_admin continua passando (o caminho
  que originalmente exercitou o bug).
- Considerar aplicar o mesmo padrão preventivo (banir defaults em overloads
  expostos ao PostgREST) para outras RPCs identificadas em D20-D
  (`check_blast_radius`, `validate_blast_radius`, `test_rls_isolation`) na
  Sprint 2.
