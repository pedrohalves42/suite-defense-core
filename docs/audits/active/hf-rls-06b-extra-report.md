# HF-RLS-06B-EXTRA — Fechamento de NEW-P0-A e NEW-P0-C

**Data:** 2026-07-01
**Escopo:** `public.get_agents_snapshots_list(uuid)`, `public.get_agents_list(uuid, boolean [, uuid])`, guarda SQL de invariante, um caller TS.
**Estado do incidente:** **P0 em remediação → 2 dos 3 vetores fechados.** Sweep global concluído (read-only), auditoria complementar catalogada. **HF-RLS-06C ainda bloqueado** conforme sequência autorizada.

---

## 1. Correções aplicadas

### 1.1 HF-RLS-06B-EXTRA-A — `get_agents_snapshots_list`

**Antes:**
```sql
v_effective_tenant_id := COALESCE(p_tenant_id, get_active_tenant_id());
IF v_effective_tenant_id IS NOT NULL AND NOT is_current_super_admin() THEN
  PERFORM _assert_caller_tenant(v_effective_tenant_id);
END IF;
-- WHERE (v_effective_tenant_id IS NULL OR a.tenant_id = v_effective_tenant_id)
```
Fluxo do exploit: `anon` + `{}` → `p_tenant_id=NULL` → `get_active_tenant_id()=NULL` → `v_effective_tenant_id=NULL` → **guarda pulada** → `WHERE` degenera para `TRUE` → 200 · 15 KB · todos os tenants.

**Depois:**
```sql
IF v_effective_tenant_id IS NULL AND NOT v_is_super_admin THEN
  RAISE EXCEPTION 'TENANT_REQUIRED: ...' USING ERRCODE = '42501';
END IF;
IF v_effective_tenant_id IS NOT NULL AND NOT v_is_super_admin THEN
  PERFORM _assert_caller_tenant(v_effective_tenant_id);
END IF;
```
Fail-closed. Super_admin com `p_tenant_id=NULL` continua com visão global (comportamento intencional e explícito).

### 1.2 HF-RLS-06B-EXTRA-C — `get_agents_list`

Causa raiz do PGRST203: a migração `20260515115359` criou o overload de 3 argumentos com `CREATE OR REPLACE`. Postgres **não substitui overloads** — cria uma função nova. A variante 2-arg pré-existente permaneceu no catálogo, gerando a ambiguidade PostgREST. **Não é regressão do HF-RPC-OVERLOAD-AUDIT-01** (aquele hotfix cobriu apenas `has_role`); é a mesma classe de bug, ainda não coberta.

**Correção (assinatura única):**
- `DROP FUNCTION public.get_agents_list(uuid, boolean, uuid)` — 0 callers TS/Edge usavam `p_agent_id`.
- Único caller que passava 3 args (`src/lib/agentQueryHelper.ts::fetchAgentById`) foi ajustado para filtrar por `agent_id` no cliente sobre a lista canônica do tenant.
- Guard SQL permanente: `tools/tests/assert_get_agents_list_no_overload_ambiguity.sql` (colhido automaticamente pelo workflow `sql-invariants.yml`). Falha o pipeline se qualquer novo overload aparecer.

## 2. Validação de exploração (evidência, não hipótese)

Reexecutado como `anon` (apenas apikey pública, sem JWT), contra a produção:

| Caso | Body | Antes | Agora |
|------|------|-------|-------|
| A | `get_agents_snapshots_list {}` | **200 · 15 KB · todos os tenants** | **401 · `TENANT_REQUIRED`** ✅ |
| B | `get_agents_snapshots_list {p_tenant_id:X}` | 400 (guarda) | **400 · `TENANT_FORBIDDEN`** ✅ |
| C1 | `get_agents_list {p_tenant_id, p_include_archived}` | 300 · PGRST203 | **400 · `TENANT_FORBIDDEN`** ✅ (autorização agora executa) |
| C2 | `get_agents_list {..., p_agent_id:null}` | **200 · 2 KB · vaza frota** | **404 · PGRST202 (função não existe)** ✅ |

Faltam (dependem de sessão real, serão cobertos pelo pack e2e antes do HF-RLS-06C):

| Caso | Cenário | Esperado |
|------|---------|----------|
| D | `authenticated` sem tenant ativo | 401/403 |
| E | `authenticated` tenant A → pede tenant A | 200 apenas tenant A |
| F | `authenticated` tenant A → pede tenant B | 400 `TENANT_FORBIDDEN` |
| G | `super_admin` sem `p_tenant_id` | 200 visão global (intencional) |

Ação: adicionar `e2e/hf-rls-06b-extra-authz.spec.ts` no próximo passo, antes de autorizar HF-RLS-06C.

## 3. Sweep global do padrão `tenant IS NULL` (read-only)

Query executada em `pg_catalog` sobre 438 `SECURITY DEFINER` do schema `public`. Padrões buscados: `COALESCE(...get_active_tenant_id`, `tenant_id IS NULL OR`, `OR tenant_id IS NULL`, `IF tenant... IS NULL THEN RETURN`.

**Resultado bruto:** 32 funções contêm um desses padrões. **Nenhuma promovida a P0 sem leitura de código** — segue a política reforçada.

### 3.1 Classificação por exposição

| Camada | Qtd | Ação |
|--------|-----|------|
| `anon` + `authenticated` EXECUTE | 3 | `check_blast_radius`, `get_agents_snapshots_list` ✅ **corrigida**, `has_role(3-arg)` — próximas leituras obrigatórias |
| Apenas `authenticated` EXECUTE, com `p_tenant_id` | 8 | leitura de corpo pendente antes de qualquer fix |
| Sem grant público (uso interno / trigger / edge com service_role) | 21 | risco baixo; auditar quando houver folga |

Lista completa (32) e grants por função estão em `docs/audits/active/hf-rls-06b-extra-sweep.tsv`.

### 3.2 Achados de leitura já feitos

- **`check_blast_radius`** — anon EXECUTE. Padrão `COALESCE(get_active_tenant_id())` presente. **Não confirmado como exploitável** ainda (a função apenas soma métricas, não retorna PII). Marcado como **HF-RLS-06B-EXTRA-D (P1 hipótese)**: precisa de leitura de corpo + PoC antes de virar hotfix.
- **`has_role(_user_id, _role text, _tenant_id uuid)`** — anon EXECUTE. Sem padrão `IS NULL bypass` no corpo (usa apenas `EXISTS ...` com `_tenant_id`). Continua listada em D20D-03 (oráculo de roles) e deverá ser tratada em **HF-RLS-06C** (REVOKE de `PUBLIC`).

Nenhuma alteração aplicada nesses itens. Nenhuma promoção a P0 sem evidência.

## 4. Estado do incidente

| Vetor | Status |
|-------|--------|
| `_assert_caller_tenant` bypass | ✅ Resolvido (HF-RLS-06B) |
| `_assert_service_role_or_super_admin` bypass | ✅ Resolvido (HF-RLS-06B) |
| **NEW-P0-A** — `get_agents_snapshots_list` NULL-tenant fan-out | ✅ **Resolvido (HF-RLS-06B-EXTRA-A)** |
| **NEW-P0-C** — `get_agents_list` overload ambiguity | ✅ **Resolvido (HF-RLS-06B-EXTRA-C)** |
| Testes negativos e2e (D–G) | 🔜 pendente antes de HF-RLS-06C |
| Sweep global padrões `IS NULL` | ✅ Concluído (read-only). Fila catalogada, 0 fixes prematuros. |
| HF-RLS-06C — REVOKE PUBLIC / anon nas 3 SECURITY DEFINER expostas | ⏸ aguardando ordem (após e2e + revisão HF-RLS-06B-EXTRA-D) |
| HF-RLS-01 — RLS na partição `agent_system_metrics_2026_08` | ⏸ na fila |

**Critérios do incidente ainda em aberto:**
- Suíte e2e negativa (autenticado sem tenant, cross-tenant, super_admin) versionada no CI.
- HF-RLS-06B-EXTRA-D revisada (`check_blast_radius`) — confirmar/refutar antes do REVOKE.
- HF-RLS-06C aplicado (REVOKE PUBLIC nas 3).
- HF-RLS-01 aplicado.

O incidente permanece formalmente como **P0 em remediação**.

## 5. Governança

- Guard SQL `assert_get_agents_list_no_overload_ambiguity.sql` adicionado ao pacote `tools/tests/`; o workflow `sql-invariants.yml` já o executa (glob).
- `assert_has_role_no_overload_ambiguity.sql` continua em vigor. Recomenda-se, no próximo bloco, um guard genérico `assert_no_postgrest_overload_ambiguity.sql` que enumere overloads com defaults sobrepostos em todo `public`.
- Nenhum grant foi ampliado. Nenhuma função foi promovida a `SECURITY INVOKER` sem análise.
