# P0-01 — RLS cross-tenant · Investigation (Sprint 1 · Pré-fix)

- Date: 2026-07-09
- Owner: Security Lead
- Mode: read-only spike (nenhuma migration/policy/GRANT alterado)
- Precede: Discovery em `discovery.md` (classificado `Needs Investigation`)

## Objetivo

Transformar as 71 WARN do linter em veredito rastreável antes de qualquer
correção de runtime. Três hipóteses a testar:

1. Existe tabela pública sem RLS? (rota trivial de bypass)
2. Existe policy `always-true` para `INSERT/UPDATE/DELETE/ALL` fora de
   `service_role`? (bypass silencioso)
3. Existe função `SECURITY DEFINER` executável por `anon` sem
   `search_path`? (schema-hijacking → escala privilégios e ignora RLS)

## Evidência coletada (2026-07-09, read-only)

### H1 — Tabelas públicas sem RLS

```sql
SELECT count(*) FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = false;
```

Resultado: **0**.

Interpretação: nenhuma rota trivial de bypass por ausência de RLS.

### H2 — Policies `always-true` fora de `service_role`

```sql
SELECT * FROM pg_policies
WHERE schemaname='public' AND cmd <> 'SELECT'
  AND (qual='true' OR with_check='true')
  AND NOT ('service_role' = ANY(roles));
```

Resultado: **0 linhas**.

Todas as ocorrências do lint 0024 são policies escopadas exclusivamente
a `service_role` (padrão legítimo: audit_logs particionados, hmac_signatures,
automation_*, oncall_*, sli/slo, mitre_rules). O linter não distingue
`service_role` e reporta como WARN.

Interpretação: **falso positivo estrutural** do lint 0024 nesta base.

### H3 — SECURITY DEFINER executável por anon

```sql
-- Funções e status do search_path
SELECT name, args, has_search_path FROM (...);
```

| Função                        | search_path? |
| ----------------------------- | :----------: |
| `assert_partition_rls`        |      ✅       |
| `check_blast_radius`          |      ✅       |
| `check_tenant_suspension`     |      ✅       |
| `enforce_critical_job_evidence` |    ✅       |
| `ensure_partition_rls`        |      ✅       |
| `has_role`                    |      ✅       |

Total: **6 funções**, **100% com `search_path` explícito** (D20-A guard
já cobre isso em CI — ver `tools/tests/assert_security_definer_search_path.sql`).

Contagem agregada:
- SECURITY DEFINER em `public`: **439**
- Executáveis por `anon`: **6** (todas com `search_path`)
- Executáveis por `authenticated`: **64**

Interpretação: sem vetor de schema-hijacking pelas funções expostas a
anon. Os 64 acessíveis por `authenticated` alimentam a triagem residual
(warnings 0028/0029) mas não são risco cross-tenant enquanto usarem
`get_active_tenant_id()`/`has_role()` internamente.

## Classificação atualizada

| Hipótese | Resultado | Classificação parcial              |
| -------- | --------- | ---------------------------------- |
| H1       | 0         | False Positive                     |
| H2       | 0         | False Positive (lint 0024 ruído)   |
| H3       | 0 unsafe  | False Positive (D20-A já cobre)    |

**Veredito parcial:** P0-01 caminha para `False Positive` estrutural.

**Bloqueio para fechar:** falta o único teste que prova isolamento real —
**query cruzada tenant × tenant com contas sintéticas** contra todas as
tabelas multi-tenant listadas em
`eslint-plugin-multitenant/src/rules/no-supabase-query-without-tenant.ts`.

## Próximo passo (ainda sem tocar runtime)

1. Criar 2 tenants sintéticos + 1 usuário `authenticated` por tenant
   (via seed script isolado; nenhuma migration de schema).
2. Para cada tabela em `MULTI_TENANT_TABLES`, executar como usuário do
   tenant A:
   ```sql
   SELECT count(*) FROM public.<t> WHERE tenant_id <> auth_active_tenant();
   ```
3. Registrar `before.sql` com queries + resultado esperado `0` em todas.
4. Se qualquer linha `> 0`: reclassificar como `Confirmed`, abrir fix
   direcionado à policy da tabela específica.
5. Se todas `= 0`: fechar P0-01 como `False Positive` documentado,
   anexar `after.sql` com a mesma query + resultado.

## Restrições respeitadas nesta etapa

- 0 migrations executadas
- 0 policies alteradas
- 0 GRANTs alterados
- 0 mudanças em `_shared/reliability/*`
- 0 mudanças em runtime

## Referências

- `hardening-tracking-board.md` linha P0-01
- `evidence/P0-01-rls/discovery.md` (Sprint 0)
- `tools/tests/assert_security_definer_search_path.sql`
- Linter run: 2026-07-09 (71 WARN, 0 ERROR)
