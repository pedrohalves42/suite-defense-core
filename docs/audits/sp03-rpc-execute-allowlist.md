# PR S-P0.3 — RPC EXECUTE Allowlist Audit (Fase A — Relatório)

**Status**: Fase A (somente relatório). Nenhuma migração aplicada. Fase B (revogação) proposta abaixo, aguardando aprovação.

---

## Sumário

| Métrica                                          | Valor |
|--------------------------------------------------|-------|
| Total funções `SECURITY DEFINER` em `public`     | 435   |
| Com `EXECUTE` para `anon`                        | **4** |
| Com `EXECUTE` para `authenticated`               | **61** |
| Candidatas a **revogação imediata**              | **4** (anon redundante) |
| Candidatas a revogação em `authenticated`        | **0** (todas com uso real) |

---

## 1. RPCs expostas a `anon` (4) — REVOGAR `anon`

Cada uma tem `EXECUTE` redundante para `anon` (e também para `authenticated`). Análise de uso real no código mostra que **todas são chamadas apenas em hooks/contextos autenticados**.

| Função | Args | Uso (arquivos) | Contexto | Justificativa anon? | Decisão |
|--------|------|----------------|----------|---------------------|---------|
| `check_tenant_suspension` | `p_tenant_id uuid` | 1 (`useAuth` flow) | Pós-login | ❌ Não — depende de tenant id resolvido após auth | **Revogar `anon`** |
| `get_agents_list` | `p_tenant_id, p_include_archived` | 60 | Dashboard/Agents (autenticado) | ❌ Não | **Revogar `anon`** |
| `get_agents_list` | `p_tenant_id, p_include_archived, p_agent_id` | (sobrecarga) | idem | ❌ Não | **Revogar `anon`** |
| `get_agents_snapshots_list` | `p_tenant_id uuid` | 3 | Snapshots autenticados | ❌ Não | **Revogar `anon`** |

**Risco da revogação**: Baixo. Frontend sempre chama com sessão JWT válida (role `authenticated`). Sem chamadas anônimas legítimas detectadas.

---

## 2. RPCs expostas a `authenticated` (61) — MANTER

Varredura `rg -lc "\bnome\b" src/ supabase/functions/`: **0 RPCs com zero uso**. Todas atendem ao dashboard, hooks, edge functions ou middleware. Lista completa:

```
_assert_caller_tenant, acknowledge_all_alerts, archive_agent,
check_tenant_suspension, diagnose_agent, get_active_tenant_id,
get_adaptive_blast_radius, get_agent_disk_details,
get_agent_health_metrics, get_agent_network_events,
get_agent_processes, get_agent_snapshot, get_agents_list (×2),
get_agents_snapshots_list, get_ai_provider_scores,
get_alert_decision_chain, get_audit_raw_metrics,
get_autonomy_metrics, get_balanced_pending_actions,
get_batch_counts, get_cached_value, get_critical_insights_count,
get_decision_timeline, get_enrollment_key_full,
get_evidence_summary, get_governance_snapshot (×2),
get_honeypot_stats, get_latest_agent_metrics,
get_mfa_user_count, get_mitre_coverage_by_platform,
get_mitre_coverage_by_tactic, get_pending_events,
get_playbook_execution_breakdown, get_playbook_metrics,
get_previous_audit_score, get_recent_jobs,
get_session_timeout_minutes, get_smart_notifications,
get_software_risk_summary, get_stale_agents,
get_system_mode, get_system_mode_safe,
get_tenant_abuse_metrics, get_tenant_cost_metrics,
get_tenant_mfa_policy, get_threat_intel_stats,
get_trace_timeline, get_user_roles, get_user_tenant_id_safe,
get_valid_agent_signing_key, get_valid_agent_signing_key_by_agent,
get_vulnerability_counts, has_role, has_role_safe,
is_current_super_admin, is_super_admin,
log_security_violation, log_session_start, update_session_activity
```

**Decisão**: nenhuma revogação em `authenticated` nesta rodada. Catalogar para auditoria periódica.

---

## 3. Fase B — Migração proposta (aguarda aprovação)

Migração mínima e explícita (sem revogação cega):

```sql
-- Revoga EXECUTE de 'anon' nas 4 RPCs que não têm caso de uso público.
-- Mantém 'authenticated' e 'service_role' intactos.

REVOKE EXECUTE ON FUNCTION public.check_tenant_suspension(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) FROM anon;
```

### Rollback
```sql
GRANT EXECUTE ON FUNCTION public.check_tenant_suspension(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) TO anon;
```

### Smoke tests sugeridos antes de aplicar em produção
1. Login (anon → authenticated transition).
2. Dashboard de agentes (`get_agents_list`).
3. Snapshots (`get_agents_snapshots_list`).
4. Heartbeat (não usa essas RPCs — verificar).
5. Onboarding/installer (verificar `check_tenant_suspension` não é chamado em fluxo anônimo).

### Risco de regressão
- **Baixo**: nenhuma chamada anônima legítima identificada.
- **Mitigação**: rollback é trivial (4 GRANT statements).

---

## 4. Critério para fechar S-P0.3

| Validação                              | Status atual |
|----------------------------------------|--------------|
| Relatório completo                     | ✅ (este doc) |
| Migração revoke escrita                | ✅ (acima — Fase B) |
| Rollback documentado                   | ✅ |
| Smoke tests definidos                  | ✅ |
| Aprovação para aplicar Fase B          | ⏳ aguardando usuário |
| RPC `anon` indevidas                   | 4 (após Fase B → 0) |
| RPC `authenticated` fora da allowlist  | 0 |

---

## Próximo passo

Aguardo aprovação para **disparar a migração da Fase B** (4 REVOKE statements). Em seguida abro PR S-P0.5 (trigger DB defesa em profundidade do `ack-job`).
