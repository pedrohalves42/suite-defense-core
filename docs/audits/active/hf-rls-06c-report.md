# HF-RLS-06C — Redução de Superfície (EXECUTE grants)

**Escopo**: revogar `EXECUTE` de `PUBLIC`/`anon` nas RPCs alvo do incidente
HF-RLS-06B, mantendo apenas os grants mínimos necessários (authenticated +
service_role). Bloco pequeno, auditável, sem alteração de lógica.

**Status**: ✅ Concluído.
**Referências anteriores**: `hf-rls-06b-report.md`, `hf-rls-06b-extra-report.md`,
`hf-rls-06b-e2e-negative-report.md`.

---

## 1. Inventário (pré-mudança)

Coletado via `pg_proc` / `pg_get_function_identity_arguments` / `p.proacl`:

| RPC                                                  | Owner    | Security | Grants efetivos                                       |
| ---------------------------------------------------- | -------- | -------- | ----------------------------------------------------- |
| `public.get_agents_list(uuid, boolean)`              | postgres | DEFINER  | `PUBLIC=X`, `authenticated=X`, `service_role=X`       |
| `public.get_agents_snapshots_list(uuid)`             | postgres | DEFINER  | `PUBLIC=X`, `authenticated=X`, `service_role=X`       |

Observação: `PUBLIC=X` implica execução por `anon` (não havia grant explícito
para `anon`, mas o caminho existia por herança de `PUBLIC`).

### Consumidores mapeados

| Papel           | Consumidor                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------ |
| `authenticated` | 45+ chamadas em `src/**` via `supabase.rpc(...)`. Todos os fluxos legítimos passam por aqui. |
| `service_role`  | Reservado para scripts administrativos / edge functions futuras. Nenhum uso runtime hoje.  |
| `PUBLIC`        | **Nenhum consumidor legítimo documentado.**                                                |
| `anon`          | **Nenhum requisito funcional documentado.**                                                |
| Edge functions  | Nenhuma invocação em `supabase/functions/**` (apenas tipos declarativos).                  |

Critério para justificar revogação: sem consumidor legítimo em produção,
sem requisito funcional documentado, sem uso em edge functions/cron.

---

## 2. Mudança aplicada

Migração `HF-RLS-06C` (aprovada e executada):

```sql
REVOKE EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid)     TO authenticated, service_role;
```

Sem alteração de assinatura, corpo, RLS ou policies.

---

## 3. Evidência de redução de superfície

Verificação pós-mudança via `p.proacl`:

| RPC                              | PUBLIC (antes → depois) | anon (antes → depois) | authenticated | service_role |
| -------------------------------- | ----------------------- | --------------------- | ------------- | ------------ |
| `get_agents_list(uuid, boolean)` | ✔ → ✖                   | ✔ (via PUBLIC) → ✖    | ✔ (mantido)   | ✔ (mantido)  |
| `get_agents_snapshots_list(uuid)`| ✔ → ✖                   | ✔ (via PUBLIC) → ✖    | ✔ (mantido)   | ✔ (mantido)  |

ACL efetiva pós-mudança:

```
get_agents_list           -> postgres=X, authenticated=X, service_role=X
get_agents_snapshots_list -> postgres=X, authenticated=X, service_role=X
```

`=X/postgres` (PUBLIC) removido em ambas.

---

## 4. Validação pós-alteração

### 4.1 Reprodução do exploit anônimo (antes bloqueado por whitelist interna)

```
POST /rest/v1/rpc/get_agents_list          (anon, p_tenant_id=null)         → HTTP 401 · 42501 permission denied
POST /rest/v1/rpc/get_agents_snapshots_list (anon, p_tenant_id=null)         → HTTP 401 · 42501 permission denied
```

**Defense-in-depth**: o bloqueio agora ocorre no *grant layer* (antes de
qualquer código PL/pgSQL executar), em vez de depender exclusivamente da
whitelist interna `_assert_caller_tenant`.

### 4.2 Suíte E2E negativa (`e2e/hf-rls-06b-negative.spec.ts`)

Regex dos casos A/B atualizado para aceitar `permission denied` (bloqueio no
grant layer) além de `TENANT_REQUIRED|TENANT_FORBIDDEN`. Matriz completa
continua verde:

| Caso | Chamador     | p_tenant_id  | Antes 06C           | Depois 06C                    |
| ---- | ------------ | ------------ | ------------------- | ----------------------------- |
| A    | anon         | NULL         | 4xx TENANT_REQUIRED | 401 permission denied (grant) |
| B    | anon         | tenant real  | 400 TENANT_FORBIDDEN| 401 permission denied (grant) |
| C    | viewer       | own tenant   | 200 OK              | 200 OK (inalterado)           |
| D    | viewer       | foreign uuid | 400 TENANT_MISMATCH | 400 TENANT_MISMATCH           |
| E    | viewer       | NULL         | 4xx TENANT_REQUIRED | 4xx TENANT_REQUIRED           |
| F    | super_admin  | NULL         | 4xx TENANT_REQUIRED | 4xx TENANT_REQUIRED (F1)      |
| G    | super_admin  | tenant real  | 200 OK              | 200 OK (inalterado)           |

### 4.3 Fluxos positivos do frontend

- **viewer** (`viewer@cybershield.test`) autenticado + `p_tenant_id=TENANT_A` → 200 OK
  em ambas RPCs (casos C/G da suíte).
- Nenhuma das 45+ call sites em `src/**` foi alterada; contrato de invocação
  preservado.

### 4.4 service_role

Grant preservado; nenhuma regressão esperada em automações administrativas.

---

## 5. Critério de aceite (checklist)

- [x] Inventário completo registrado antes da mudança.
- [x] Grants revogados apenas em `PUBLIC`/`anon`, com justificativa documentada.
- [x] Nenhuma revogação em lote — escopo restrito às 2 RPCs alvo.
- [x] Suíte E2E `hf-rls-06b-negative.spec.ts` sem regressão (regex casos A/B
      atualizado para refletir o novo layer de bloqueio, matriz idêntica).
- [x] Fluxo positivo (viewer/super_admin) para cada RPC validado.
- [x] Tabela antes/depois de superfície de exposição incluída no relatório.
- [x] Nenhuma integração legítima perdeu acesso.

---

## 6. Escopo explicitamente fora do 06C

Confirmado *não incluído* nesta janela (agendado separadamente):

- **HF-RLS-01** — RLS da partição `agent_system_metrics_2026_08` (próximo).
- **HF-RLS-06B-EXTRA-D** — `check_blast_radius` (P1, sweep 32 funções).
- Refactors de autorização / novos padrões.

---

## 7. Estado do programa

- **Incidente Primário HF-RLS-06B**: continua **MITIGADO**, agora com
  defense-in-depth adicional (grant layer + whitelist interna).
- **Programa de Hardening RLS**: **ABERTO** — próximo bloco autorizado é
  HF-RLS-01 (RLS da partição).
