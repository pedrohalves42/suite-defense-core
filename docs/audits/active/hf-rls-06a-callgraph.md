# HF-RLS-06A — Call graph e evidência de exploração de `_assert_caller_tenant`

Status: **Read-only inventory concluído** · Nenhuma alteração aplicada
Owner: Platform Security
Data: 2026-07-01
Escopo autorizado: **apenas** enumeração/evidência. Não corrigir a função.

---

## 1. Empirical role test (reproduzido contra PostgREST)

Requisição anônima (apenas `apikey` = anon key pública, sem JWT de usuário):

| # | RPC | Body | HTTP | Bytes | Resultado |
|---|---|---|---|---|---|
| a | `get_agents_snapshots_list` | `{}` (sem `p_tenant_id`) | **200** | 15 244 | ✅ **Exploit confirmado** — retorna agentes de **todos** os tenants (visão global) |
| b | `get_agents_snapshots_list` | `{"p_tenant_id":"<UUID real>"}` | **200** | 1 898 | ✅ **Exploit confirmado** — vaza a frota inteira do tenant escolhido |
| c | `get_agents_list` | `{"p_tenant_id":"<UUID>"}` | 300 | — | Bloqueado por `PGRST203` (overload) — **não** por autorização |
| d | `get_agents_list` | `{"p_tenant_id","p_include_archived":false}` | 300 | — | Idem — overload ambiguity |
| e | `get_agents_list` (3-arg) | `{"p_tenant_id","p_include_archived":false,"p_agent_id":null}` | **200** | 2 089 | ✅ **Exploit confirmado** — o overload 3-arg é resolvível e vaza a frota |

**Conclusão da hipótese anterior:** promovida para ✅ **Confirmada por reprodução**.
A guarda `_assert_caller_tenant` deixa passar chamadas com `role='anon'`
porque o teste é `IS DISTINCT FROM 'authenticated'`, e `anon != 'authenticated'`.
O overload 2-arg de `get_agents_list` está inacessível somente por acidente
(ambiguidade PGRST203) — não por controle de acesso.

Amostras HTTP integrais em `/tmp/r{1,2,5}.json` (mesmo host de execução).

---

## 2. Call graph de `_assert_caller_tenant`

### 2.1 Chamadores diretos (48 funções, todas `SECURITY DEFINER`, schema `public`)

Enumeração via `pg_get_functiondef ~ '_assert_caller_tenant'`:

```
acknowledge_all_alerts              get_playbook_metrics
auto_approve_safe_actions           get_previous_audit_score
backfill_audit_log_hashes           get_recent_jobs
calculate_confidence_gap            get_smart_notifications
calculate_pipeline_metrics          get_software_risk_summary
check_action_rate_limit             get_stale_agents
check_ai_circuit_breaker            has_recent_playbook_execution
check_installation_failure_rate     log_security_violation
check_offline_agents_for_playbook   process_dlq_batch
cleanup_all_problematic_agents      reactivate_tenant
cleanup_stale_tasks                 reanchor_audit_log_chain
cleanup_suspended_tenant_data       register_failure_occurrence
create_jobs_for_all_agents          requires_human_review
diagnose_agent_issues               should_auto_quarantine
diagnose_chain_health               update_quota_usage
ensure_tenant_features              validate_blast_radius
evaluate_playbook_trigger           verify_audit_log_chain
execute_rollback_test               verify_evidence_log_chain
generate_audit_reason_tree          verify_security_log_chain
get_agent_health_metrics            get_agents_list (2-arg)     ⚠
get_agents_list (3-arg)         ⚠  get_agents_snapshots_list   ⚠
get_audit_raw_metrics               get_critical_insights_count
get_governance_snapshot             get_latest_agent_metrics
get_mfa_user_count                  get_playbook_execution_breakdown
```

Total: **48 funções**. ⚠ = grant PUBLIC EXECUTE confirmado.

### 2.2 Views / Triggers

- Views que referenciam `_assert_caller_tenant`: **0**
- Triggers que referenciam: **0**

### 2.3 pg_cron / scheduled_jobs

- Schema `cron` não é acessível ao papel de auditoria (`sandbox_exec`). Requer
  verificação via console Postgres em janela de mudança.
- `public.scheduled_jobs`: nenhum registro cujo payload/nome referencia as
  48 funções acima ou `_assert_caller_tenant`.

---

## 3. Exposição real (grants PUBLIC/anon) — recorte crítico

Consulta `aclexplode(proacl)` filtrando `grantee=0` (PUBLIC) e `anon`
sobre as 48 callers:

| RPC | Grantee | Priv |
|---|---|---|
| `get_agents_list(uuid, boolean)` | **PUBLIC** | EXECUTE |
| `get_agents_list(uuid, boolean, uuid)` | **PUBLIC** | EXECUTE |
| `get_agents_snapshots_list(uuid)` | **PUBLIC** | EXECUTE |

**Nenhuma outra das 45 funções restantes tem grant a PUBLIC ou anon.**
Elas dependem do bug estar presente, mas não estão atualmente expostas.

Implicação: a vulnerabilidade P0 explorável hoje está **restrita a essas 3
RPCs**. A correção em `_assert_caller_tenant` reduz risco latente das outras
45 (defesa em profundidade), mas nenhuma delas está publicamente atingível
neste momento.

---

## 4. Consumidores legítimos (frontend + edge functions)

Contagem de arquivos referenciando cada caller via `supabase.rpc(...)`:

| RPC | src (frontend) | supabase/functions | Observação |
|---|---:|---:|---|
| `get_agents_list` | 53 | 0 | núcleo do frontend |
| `get_agents_snapshots_list` | 1 | 0 | `useAgentSnapshots.ts` |
| `ensure_tenant_features` | 0 | 5 | edge only |
| `acknowledge_all_alerts` | 2 | 1 | misto |
| `check_action_rate_limit` | 0 | 3 | edge only |
| `get_audit_raw_metrics` | 0 | 3 | edge only |
| `requires_human_review` | 0 | 3 | edge only |
| Outras 41 | ≤2 cada | ≤1 cada | baixo tráfego |
| Nenhum consumidor detectado | 15 | 15 | candidatas a revoke futuro |

Nenhum consumidor documentado depende do comportamento **bypass anon** —
todos operam com JWT authenticated ou service_role.

---

## 5. Risco de regressão da correção de `_assert_caller_tenant`

| Papel | Comportamento hoje | Comportamento pós-fix proposto | Impacto |
|---|---|---|---|
| `service_role` (edge, cron) | RETURN (bypass) porque `!= 'authenticated'` | RETURN (bypass) via checagem explícita | Nenhum |
| `authenticated` (usuário logado) | Valida via `user_roles` | Idem | Nenhum |
| `anon` (sem JWT) | RETURN (bypass) ← **bug** | RAISE `TENANT_MISMATCH` | ✅ Fecha vulnerabilidade |
| `postgres` / `sandbox_exec` / owners | RETURN (bypass) | RETURN (bypass) | Nenhum, se checagem for `IN ('service_role','postgres', ...)` ou `!= 'authenticated' AND != 'anon'` |

**Alertas de regressão para a fase HF-RLS-06B:**

1. A checagem correta é *whitelist* de roles de bypass, não *blacklist* de
   `authenticated`. Trocar por `current_setting('role', true) = 'service_role'`
   corrige o anon, mas pode negar chamadas legítimas de owners internos
   (raras, mas existem em migrations e alguns crons Postgres).
2. `auth.role()` (helper Supabase) retorna `anon` para requisições anônimas
   e é mais confiável que `current_setting`. Recomendado para o fix.
3. Regressão a validar: 48 RPCs continuam operando para authenticated e
   service_role; anon passa a receber `TENANT_MISMATCH`.

---

## 6. Fila autorizada (não executada)

- ✅ **HF-RLS-06A** — este inventário. Concluído.
- ⏸ HF-RLS-06B — fix cirúrgico em `_assert_caller_tenant` + suíte de regressão.
  Aguardando autorização.
- ⏸ HF-RLS-06C — REVOKE EXECUTE FROM PUBLIC nas 3 RPCs comprovadamente
  expostas. Autorização condicionada ao sucesso da regressão de 06B.
- ⏸ HF-RLS-06D — defesa em profundidade em `get_agents_snapshots_list`
  (rejeitar `v_effective_tenant_id IS NULL` para não-super_admin).
- 🟢 HF-RLS-01 — RLS na partição `agent_system_metrics_2026_08`. Independente,
  pode correr em paralelo.

---

## 7. Trabalho contínuo proposto

Scanner permanente (`tools/tests/assert_definer_public_exposure.sql`) para
gerar, a cada migration, a matriz:

```
| function | SECURITY DEFINER | usa _assert_caller_tenant | EXECUTE PUBLIC | EXECUTE anon | usa auth.uid() | status |
```

falhando CI se qualquer função `SECURITY DEFINER` for exposta a PUBLIC/anon
sem justificativa em allowlist.

Não implementado neste bloco — proposta para HF-RLS-06E.

---

## Anexo A — Comandos de reprodução (referência)

```bash
ANON=<anon-jwt>
URL=https://<project>.supabase.co/rest/v1/rpc
# Vazamento global
curl -X POST "$URL/get_agents_snapshots_list" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' -d '{}'
# Vazamento por tenant
curl -X POST "$URL/get_agents_list" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' \
  -d '{"p_tenant_id":"<uuid>","p_include_archived":false,"p_agent_id":null}'
```
