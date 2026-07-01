# HF-RLS-06B — Correção da classe de vulnerabilidade em guardas compartilhadas

**Status:** Fase 1-3 concluídas (guarda). Fase 4 (grants) pendente de autorização. **Novos findings P0** promovidos por evidência abaixo.

## 1. Fase 1 — Correção da guarda compartilhada

### 1.1 Diagnóstico raiz

`_assert_caller_tenant` (e a irmã `_assert_service_role_or_super_admin`) usavam **blacklist inversa**:

```sql
IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
  RETURN;  -- "bypass service_role"
END IF;
```

Como `current_setting('role')` reflete o DB role de sessão (não o JWT), qualquer chamada via PostgREST com role `anon` — que é `IS DISTINCT FROM 'authenticated'` — recebia bypass total.

### 1.2 Estratégia aplicada (whitelist via `auth.role()`)

Ambas as guardas foram reescritas para usar `auth.role()` (derivado do JWT), com bypass explícito **apenas** para `service_role` e para contexto interno sem JWT (`NULL`).

```sql
v_role := auth.role();
IF v_role = 'service_role' OR v_role IS NULL THEN RETURN; END IF;
IF v_role <> 'authenticated' THEN RAISE 'TENANT_FORBIDDEN'; END IF;
-- validação de membership em user_roles
```

### 1.3 Por que o novo critério não quebra

| Contexto            | `auth.role()` | Comportamento |
|---------------------|---------------|----------------|
| Migration (psql/postgres, sem GUC JWT) | `NULL` | bypass ✓ |
| `pg_cron` job SQL direto              | `NULL` | bypass ✓ |
| Edge function com service key         | `service_role` | bypass ✓ |
| Trigger disparado por edge function   | herda claim `service_role` | bypass ✓ |
| Usuário autenticado                   | `authenticated` | valida membership ✓ |
| PostgREST anon                        | `anon` | **negado** (era bypass) |
| SECURITY DEFINER aninhada             | preserva claim do chamador original | correto |

`current_setting('role')` continua sendo usado por 6 funções auxiliares — todas com padrão **whitelist** (`IN ('service_role',...)` ou `= 'service_role'`), portanto sem a mesma classe de defeito.

## 2. Fase 2 — Inventário de impacto

`_assert_caller_tenant` é chamada por **48 funções**, todas `SECURITY DEFINER` owner=`postgres`. Nenhuma concede `EXECUTE` a `anon`. Distribuição dos grants (além de owner/service_role):

| Categoria de grant | Nº de funções |
|--------------------|---------------|
| `authenticated` + `service_role`   | 12 |
| Apenas `service_role`              | 30 |
| `PUBLIC` (empty grantee `-`)       | 6  ← alto risco residual |

As 6 com `PUBLIC EXECUTE` incluem `get_agents_snapshots_list`, `get_agents_list` (2 overloads) e outras — já eram conhecidas no D20D-01 e continuam pendentes para HF-RLS-06C.

Lista completa dos 48 callers: `/tmp/callers.txt` (persistido durante a auditoria).

Sibling `_assert_service_role_or_super_admin` — mesma correção aplicada. Callers usam padrão análogo (cron/admin RPCs).

## 3. Fase 3 — Reexecução da exploração

Executado contra a API pública com a chave `anon` publicável. Casos D/E/F/G/H/I/J via `psql` com `set_config('request.jwt.claims', …)` para simular contextos JWT específicos.

| # | Contexto | Alvo | Antes | Depois |
|---|----------|------|-------|--------|
| **A** | anon | `get_agents_snapshots_list({})` | 200 · 15 KB · cross-tenant | **200 · 15 KB · cross-tenant** ⚠ |
| **B** | anon | `get_agents_snapshots_list({p_tenant_id:X})` | 200 · dados do tenant X | **400 · TENANT_FORBIDDEN** ✅ |
| **C** | anon | `get_agents_list(p_tenant_id:X)` | 200 (via bypass) | **300 · PGRST203 (overload)** ⚠ |
| **D** | authenticated, tenant próprio | `_assert_caller_tenant` | ok | **ok** ✅ |
| **E** | authenticated, tenant alheio | `_assert_caller_tenant` | (bypass anterior) | **TENANT_MISMATCH** ✅ |
| **F** | service_role | `_assert_caller_tenant` | ok | **ok** ✅ |
| **G** | sem JWT (migration) | `_assert_caller_tenant` | ok | **ok** ✅ |
| **H** | anon | `_assert_service_role_or_super_admin` | silently bypass | **SSA-SEC-008 raise** ✅ |
| **I** | service_role | `_assert_service_role_or_super_admin` | ok | **ok** ✅ |
| **J** | anon | `_assert_caller_tenant` direto | (bypass) | **TENANT_FORBIDDEN** ✅ |

### 3.1 Casos A e C — novos P0 confirmados (fora do escopo da guarda)

A guarda está correta. Os dois resíduos são **defeitos independentes** revelados pelo fix:

- **NEW-P0-A** — `get_agents_snapshots_list` tem lógica *"se effective_tenant é NULL e não é super_admin, pula a guarda e retorna cross-tenant"*:
  ```sql
  v_effective_tenant_id := COALESCE(p_tenant_id, get_active_tenant_id());
  IF v_effective_tenant_id IS NOT NULL AND NOT is_current_super_admin() THEN
    PERFORM public._assert_caller_tenant(v_effective_tenant_id);
  END IF;
  -- ... WHERE (v_effective_tenant_id IS NULL OR a.tenant_id = v_effective_tenant_id)
  ```
  Para anon: `p_tenant_id=NULL`, `get_active_tenant_id()=NULL`, guarda **nunca chamada**, WHERE degenera para "todos os tenants". Bug do corpo da RPC, não da guarda.

- **NEW-P0-C** — Overload ambiguo `get_agents_list(uuid,bool)` vs `get_agents_list(uuid,bool,uuid)` retornou (regressão do HF-RPC-OVERLOAD-AUDIT-01). PostgREST responde 300 antes de qualquer autorização; embora não vaze dados, é um caminho de resolver-error que precisa ser reconciliado.

## 4. Fase 4 — Redução de grants (aguardando autorização)

Não executada. Escopo do HF-RLS-06C:
- Revogar `EXECUTE FROM PUBLIC` das 6 funções listadas.
- Reduzir `authenticated` grant onde a função só faz sentido para service_role.

## 5. Varredura global — outras guardas com padrão equivalente

Buscado por `current_setting('role')`, `session_user`, `auth.role()` em todas as funções `public.*`:

| Função | Padrão | Veredito |
|--------|--------|----------|
| `_assert_caller_tenant` | blacklist inversa | **corrigido** |
| `_assert_service_role_or_super_admin` | blacklist inversa | **corrigido** |
| `audit_sensitive_access_attempt` (trigger) | whitelist `auth.role()` | seguro |
| `auto_set_tenant_id` (trigger) | whitelist `IN ('service_role','postgres','supabase_admin')` | seguro |
| `diagnose_chain_health` | whitelist `= 'service_role' OR super_admin` | seguro |
| `get_agent_snapshot` | whitelist `auth.uid() IS NULL AND role='service_role'` | seguro |
| `reanchor_audit_log_chain` | whitelist | seguro |
| `reanchor_execution_chains` | whitelist | seguro |

**Nenhuma outra função reproduz o padrão blacklist**. Classe eliminada.

## 6. Conclusão

- ✅ Guarda compartilhada corrigida com whitelist explícita e documentada.
- ✅ Inventário de 48 callers produzido, nenhum com grant direto a `anon`.
- ✅ Exploração reproduzida — Casos B/D/E/F/G/H/I/J confirmam eliminação da vulnerabilidade **na guarda**.
- ✅ Sweep global confirma que não há outra `_assert_*` sofrendo do mesmo defeito.
- ⚠ Casos A e C promovidos a **NEW-P0** — bugs distintos, no corpo da RPC e no resolver de overload, respectivamente. Requerem hotfixes próprios (**HF-RLS-06B-EXTRA-A** e **-EXTRA-C**), fora do escopo autorizado atual.
- ⏸ HF-RLS-06C (grants) e HF-RLS-01 (RLS partição) aguardam autorização, na ordem definida.

### Recomendação de sequenciamento

1. Autorizar **HF-RLS-06B-EXTRA-A** — reescrever `get_agents_snapshots_list` para negar quando `v_effective_tenant_id IS NULL AND NOT super_admin` (rejeitar em vez de retornar tudo).
2. Autorizar **HF-RLS-06B-EXTRA-C** — remover/renomear o overload de 3 args de `get_agents_list` para eliminar PGRST203.
3. Reexecutar Casos A e C — devem passar para 4xx.
4. Só então avançar para HF-RLS-06C e HF-RLS-01.
