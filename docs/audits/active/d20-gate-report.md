# D20-Gate — Enforcement Permanente dos Invariantes

**Status:** ✅ Concluído
**Escopo:** Fechar os 3 gaps identificados na auditoria de encerramento antes de abrir o D20-C.
**Data:** 2026-07-01

---

## Contexto

A campanha D2–D19 eliminou centenas de regressões de tipo/RPC/segurança e institucionalizou dois mecanismos anti-regressão (guards SQL e guards TypeScript). A auditoria pós-encerramento identificou que **ambos existiam mas não estavam totalmente enforçados no CI**, o que fragilizava toda a base construída antes de abrir novos blocos de hardening (D20-C RLS).

O D20-Gate resolve isso na origem, sem tocar em nenhuma policy/RLS/RPC.

---

## Sub-blocos entregues

### D20-Gate-1 — SQL Invariants no CI

**Arquivo:** `.github/workflows/sql-invariants.yml`

Novo workflow que executa **todos** os `tools/tests/assert_*.sql` contra o banco em cada PR/push, sem modo warning.

- `ON_ERROR_STOP=1` — qualquer `RAISE EXCEPTION` reprova o merge.
- Requer secret `SUPABASE_DB_URL` no repositório GitHub.
- Sumário em `$GITHUB_STEP_SUMMARY` lista PASS/FAIL por invariante.

**Catálogo executado (21 invariantes):**

| # | Invariante | Cobertura |
|---|------------|-----------|
| 1  | `assert_active_agents_columns.sql` | Contrato colunas `active_agents` |
| 2  | `assert_agent_releases_rls.sql` | RLS agent_releases |
| 3  | `assert_agents_public_no_secrets.sql` | Views públicas sem secrets |
| 4  | `assert_ai_insights_severity.sql` | Enum severity ai_insights |
| 5  | `assert_detect_function_types.sql` | Assinaturas detect_* |
| 6  | `assert_detect_functions.sql` | Presença detect_* |
| 7  | `assert_functions_no_invalid_refs.sql` | Referências inválidas |
| 8  | `assert_has_role_no_overload_ambiguity.sql` | HF-RPC-OVERLOAD-AUDIT-01 |
| 9  | `assert_hmac_not_in_views.sql` | HMAC fora de views |
| 10 | `assert_no_invalid_table_refs.sql` | Referências de tabela |
| 11 | `assert_no_unsafe_exposed_functions.sql` | Funções expostas seguras |
| 12 | `assert_rls_hardening.sql` | RLS baseline |
| 13 | `assert_security_definer_search_path.sql` | D20-A `search_path` |
| 14 | **`assert_security_definer_owner.sql`** | **D20-Gate-4 (novo)** — OWNER=postgres |
| 15 | `assert_sensitive_tables_no_public_access.sql` | Tabelas sensíveis |
| 16 | `assert_v_agent_execution_health_columns.sql` | Contrato view |
| 17 | `assert_v_agent_lifecycle_state_columns.sql` | Contrato view |
| 18 | `assert_views_have_auth.sql` | Auth em views |
| 19 | `assert_views_have_security_invoker.sql` | Views SECURITY INVOKER |
| 20 | `assert_views_use_active_tenant.sql` | Tenancy nas views |
| 21 | `assert_jspdf_dynamic_imports.sh` | Bundle guard (shell, não SQL) |

---

### D20-Gate-2 — Guard TS de denylist global

**Arquivos:**
- `scripts/guard-no-ts-nocheck-global.sh` (novo)
- `.github/workflows/type-debt-guards.yml` (atualizado)

Substitui conceitualmente a allowlist de 152 caminhos por uma varredura global via `rg`, com exclusões mínimas e explícitas:

**Escaneia:** `src/`, `supabase/functions/`
**Ignora:** `node_modules/`, `dist/`, `build/`, `dev-dist/`, `coverage/`, `__tests__/`, `__mocks__/`, `__fixtures__/`, `fixtures/`, `*.test.ts(x)`, `*.spec.ts(x)`, `database.types.ts`, `integrations/supabase/types.ts`.

**Resultado local:** ✅ PASS (0 violações). O guard entra em vigor imediatamente sem trabalho adicional.

O guard legacy Tier 1 (`guard-no-ts-nocheck-tier1.sh`) foi **mantido como defense-in-depth** — protege os 152 arquivos críticos com uma checagem redundante e serve como documentação viva do inventário original.

---

### D20-Gate-3 — `@ts-ignore` → `@ts-expect-error` nos testes

**Arquivo:** `supabase/functions/_shared/domain/billing/__tests__/charge-subscription.test.ts`

6 ocorrências convertidas. Cada `@ts-expect-error` agora carrega justificativa explícita (`mock spy — repo.X is wrapped with Deno.spy`), alinhando com a política ESLint `ban-ts-comment` já em `error`.

Ganho: se o boundary do mock deixar de ser necessário (ex.: tipagem melhora), o compilador força a remoção do supressor — coisa que `@ts-ignore` nunca faria.

---

### D20-Gate-4 — Invariante extra de SECURITY DEFINER

**Arquivo:** `tools/tests/assert_security_definer_owner.sql`

Freeze da baseline atual: **438/438** funções `SECURITY DEFINER` em `public` são owned por `postgres`. O invariante falha se qualquer função futura for criada com outro owner (vetor clássico de escalation após `search_path`).

#### Sobre os outros dois vetores levantados

O escopo original pedia também:
- ❌ `nenhuma SECURITY DEFINER concedida a PUBLIC`
- ❌ `nenhuma EXECUTE para roles inesperadas`

**Estado atual (levantado durante o D20-Gate):** a grande maioria das 438 funções tem `EXECUTE` concedido a `PUBLIC` (padrão histórico do Postgres, que grants automaticamente a PUBLIC ao criar funções). Isso significa que ativar o guard hoje reprovaria centenas de funções — uma **campanha de remediação**, não um gate.

**Decisão:** documentar como **finding aberto** (`FINDING-D20-GATE-01`) e tratar em bloco próprio (recomendo abrir junto com o D20-D — RPC Privilege Review — já que compartilha metodologia). O guard OWNER cobre o vetor mais crítico agora.

---

## Findings abertos

### FINDING-D20-GATE-01 — SECURITY DEFINER com EXECUTE a PUBLIC

- **Severidade:** P2 (defense-in-depth; grants explícitos a `anon`/`authenticated`/`service_role` já existem em paralelo, então a superfície real é dominada por eles).
- **Escopo:** ~438 funções em `public` com `SECURITY DEFINER` e ACL `PUBLIC=X`.
- **Recomendação:** consolidar no D20-D um `REVOKE EXECUTE ... FROM PUBLIC` para todas as SECURITY DEFINER, mantendo apenas grants explícitos por role. Após remediação, ativar dois novos invariants:
  - `assert_security_definer_no_public_execute.sql`
  - `assert_security_definer_execute_role_allowlist.sql` (roles esperadas: `anon`, `authenticated`, `service_role`, `postgres`, `sandbox_exec*`)

---

## Sequência atualizada do hardening SQL

1. ✅ **D20-Gate** — este bloco (enforcement permanente)
2. 🔓 **D20-C** — Inventário RLS (read-only, autorizado)
3. ⏳ **HF-RLS-*** — apenas para findings confirmados no D20-C
4. ⏳ **D20-D** — RPC Privilege Review (inclui FINDING-D20-GATE-01)
5. ⏳ **D20-E** — Encerramento formal do hardening SQL

---

## Ação requerida do operador

Antes que o workflow `sql-invariants.yml` funcione no CI, adicionar em GitHub → Settings → Secrets and variables → Actions:

- `SUPABASE_DB_URL` — connection string Postgres com permissão de leitura em `pg_catalog` (session-pooler ou direct connection funcionam).

Sem esse secret o job falha imediatamente com mensagem explícita — comportamento intencional, evita "silent skip".
