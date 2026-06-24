# Bloco B — Passo D (CI lint + revisão `ops_checks`)

**Data:** 2026-06-24
**Modo:** sem migration funcional. Apenas leitura + CI.

---

## 1. Revisão `ops_checks`

### Schema
| coluna | tipo | natureza |
|---|---|---|
| name | text | nome do check (operacional) |
| check_type, target_url, method, timeout_ms | text/int | **endpoint/URL operacional** |
| last_run_at, last_result | tstz, jsonb | **resultado da última execução** |
| is_active | bool | flag operacional |

### Policies atuais
- `ops_checks_super_admin_only` (ALL, authenticated) — gate de escrita por super_admin ✅
- `ops_checks_view_all` (SELECT, authenticated, **USING(true)**) — leitura aberta a qualquer usuário autenticado de qualquer tenant ❌

### Conteúdo (16 linhas)
Lista de RPCs/health-monitors internos (monitor-thresholds, watchdog-non-execution, health-monitor, check-action-effectiveness, analyze-job-failure-patterns, …). **Não é catálogo público.** É inventário operacional do scheduler interno, com `target_url` e `last_result` que podem conter detalhes de infraestrutura, payloads e erros.

### Veredito
**NÃO é catálogo global seguro.** É dado operacional sensível por dois motivos:
1. **Disclosure de topologia interna**: `target_url`+`name`+`check_type` revela quais RPCs/endpoints fazem o sistema funcionar — útil para reconhecimento por atacante autenticado.
2. **Disclosure de estado operacional**: `last_result` (jsonb) frequentemente carrega stacktraces, mensagens de erro e payloads diagnósticos.

### Recomendação (PR separada — não executada agora)
Substituir `ops_checks_view_all` por gate de super_admin no SELECT também:

```sql
-- PR separada, fora desta etapa:
DROP POLICY "ops_checks_view_all" ON public.ops_checks;
CREATE POLICY "ops_checks_select_super_admin"
  ON public.ops_checks
  FOR SELECT TO authenticated
  USING (is_current_super_admin());
```

Risco da mudança: **baixo** — nenhum componente de usuário final lê `ops_checks`; apenas dashboards super_admin e o scheduler (service_role, que bypassa RLS).

Status: **aguardando PR separada conforme orientação da etapa atual**.

---

## 2. CI lint anti-regressão — Bloco B

Adicionados:
- `scripts/bloco-b-lint.sql` — DO block que valida 4 invariantes
- `.github/workflows/bloco-b-lint.yml` — roda em push/PR para main e develop

### Invariantes

| ID | Regra | Estado atual |
|---|---|---|
| **B-LINT-1** | Toda função `SECURITY DEFINER` em `public` deve ter `SET search_path` | **PASS** (0 violações) |
| **B-LINT-2** | Policies de escrita (`INSERT/UPDATE/DELETE/ALL`) com `USING(true)` ou `WITH CHECK(true)` literais são proibidas fora de `service_role` | **PASS** (0 violações) |
| **B-LINT-3** | SECURITY DEFINER fora da allowlist | **no-op** — `security_definer_allowlist` hoje cobre VIEWS, não FUNCTIONS. Quando uma allowlist por função for criada, plugar aqui. |
| **B-LINT-4** | `EXECUTE` em `SECURITY DEFINER` concedido a `anon` é proibido (com baseline) | **PASS com baseline** |

### Baseline B-LINT-4 (débito conhecido)

Cinco funções pré-existentes ficam temporariamente isentas. Cada nova ocorrência fora desta lista quebra o CI:

- `enforce_critical_job_evidence()`
- `get_agents_snapshots_list(uuid)`
- `get_agents_list(uuid, bool)` e `get_agents_list(uuid, bool, uuid)`
- `check_tenant_suspension(uuid)`

Tratamento dessas 5 fica para PR de remediação separada (revogar `EXECUTE FROM anon` caso a caso, confirmando que nenhum fluxo público depende delas).

### Critério de bloqueio
- PR só passa se `bloco-b-lint.sql` retornar `BLOCO B LINT PASSED`.
- Adicionar nova função `SECURITY DEFINER` sem `SET search_path` → **bloqueia**.
- Adicionar policy de escrita `USING(true)`/`WITH CHECK(true)` em qualquer role ≠ service_role → **bloqueia**.
- Conceder `EXECUTE` a `anon` em nova `SECURITY DEFINER` → **bloqueia**.

### Skip controlado
Se `DATABASE_URL` não estiver configurado no repo, o job falha explicitamente — não é silenciosamente verde.

---

## 3. Próximas etapas (não executadas)

1. PR separada: revogar `ops_checks_view_all`, manter apenas super_admin.
2. PR separada: revogar `EXECUTE FROM anon` nas 5 funções da baseline B-LINT-4, atualizar lint para esvaziar baseline.
3. Bloco C — guardrails rápidos.
4. Criar tenant laboratório interno antes de retomar PP02.
