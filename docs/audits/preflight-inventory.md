# Pré-flight — Inventário e Rollback (modo relatório, sem alterações)

Etapa 0 da revisão completa, executada antes de qualquer S-P0. Nenhuma migração foi aplicada nesta rodada.

---

## 1. Inventário SECURITY DEFINER (banco)

| Métrica                                | Valor |
|----------------------------------------|-------|
| Total funções `SECURITY DEFINER` em `public` | **435** |
| Sem `search_path` configurado          | **0** ✅ |
| Com `search_path = ''` (qualificação total) | 0 |
| Com `EXECUTE` para `anon`              | **4**  |
| Com `EXECUTE` para `authenticated`     | **61** |

**Conclusão**: F-001 (`search_path` mutável) já totalmente remediado. O padrão core do projeto é `SET search_path = public` — manter por compatibilidade; catalogar como melhoria futura migrar para `search_path = ''` + qualificação total (`public.tabela`, `public.func`).

### Funções `SECURITY DEFINER` expostas a `anon` (4)
- `check_tenant_suspension`
- `get_agents_list` (2 sobrecargas)
- `get_agents_snapshots_list`

→ **Risco**: avaliar se precisam ser anônimas (provavelmente sim para landing/health). Cross-ref com `security_definer_allowlist`.

### Expostas a `authenticated` (61)
Lista completa em query (RPCs como `has_role`, `get_active_tenant_id`, `acknowledge_all_alerts`, `archive_agent`, `diagnose_agent`, etc.). Não há revogação cega — cada uma é potencialmente usada por edge functions ou frontend.

**Plano para S-P0.4 (allowlist)**:
1. Gerar relatório por função: nome + chamadas reais (grep no frontend + edge).
2. Comparar com allowlist (`security_definer_allowlist`).
3. Revogar `EXECUTE` em staging primeiro.
4. Smoke test.
5. Aplicar em produção.

---

## 2. Inventário Storage

| Métrica          | Valor |
|------------------|-------|
| Buckets totais   | **2** |
| Buckets públicos | **0** ✅ |
| Policies em `storage.objects` | **10** |

### Policies ativas (resumo)
- `agent_installers_tenant_isolation` (SELECT, authenticated) — exige `(storage.foldername(name))[1] = get_active_tenant_id()::text` OR super-admin.
- `agent_scripts_tenant_isolation` (SELECT, authenticated) — idem.
- `admins_can_upload_installers_isolated` / `admins_can_upload_agent_scripts_isolated` (INSERT, authenticated) — `with_check` por tenant prefix + `has_role(admin)`.
- `admins_can_delete_own_installers` / `admins_can_delete_own_scripts` (DELETE, authenticated) — tenant + admin.
- `Agent scripts are restricted` / `Service role full access on agent-scripts` (service_role).
- `service_role_delete_installers` / `service_role_upload_agent_scripts` (service_role).

**Conclusão**: F-004 (tenant leak) **já fechado**. Não há ação imediata. Catalogar para auditoria periódica de novos buckets.

---

## 3. Inventário `ack-job` (S5/F-005)

Arquivo: `supabase/functions/ack-job/index.ts`

```ts
const CRITICAL_JOB_TYPES = [
  'security_scan',
  'software_inventory',
  'web_activity',
  'collect_web_activity',
  'scan_vulnerabilities',
];
if (CRITICAL_JOB_TYPES.includes(existingJob.type)) {
  // → 403 INTEGRITY_VIOLATION
}
```

**Conclusão**: F-005 **já mitigado em camada de aplicação**. Risco residual:
- Defesa **única** está no edge function (não no banco). Um agente malicioso que descubra outro endpoint legado ou bypass do middleware ainda poderia mudar `status='completed'`.
- Outras edge functions escrevem `jobs.status` (mas para `failed`/`cancelled`, não `completed`):
  - `ai-action-executor/handlers.ts:169` → `failed`
  - `ops-gateway/handlers/sync-jobs.ts:128` → `failed`
  - `ops-gateway/handlers/cleanup.ts:152,173,193,198` → `failed`/`cancelled`
  - `ops-gateway/handlers/security-ops.ts:72` → `cancelled`

→ Defesa adicional sugerida em **S-P0.5** (promovido conforme decisão): **trigger em `public.jobs`** que bloqueie `UPDATE` para `status='completed'` em tipos críticos quando não houver linha correspondente em telemetria (ex.: `agent_web_activity`, `software_inventory`). Implementação requer migração — deferir para próxima rodada com aprovação explícita.

---

## 4. Inventário CI / Validação

| Check                       | Status |
|-----------------------------|--------|
| `tsc --noEmit`              | ✅ 0 erros |
| `eslint`                    | ✅ 0 erros, 991 warnings |
| `supabase--linter`          | ✅ sem regressão |
| `ci/security_gate.sh`       | (existe — não rodado nesta etapa) |
| `ci/validate-middleware.sh` | (existe) |
| `tools/tests/assert_*.sql`  | (existe — guards de RLS/views) |

---

## 5. Plano de rollback (template por grupo)

Cada PR de remediação deve incluir:

```text
1. Relatório em docs/audits/<grupo>-<id>.md
2. Lista de arquivos alterados (git diff --name-only)
3. Risco de regressão (Baixo/Médio/Alto + justificativa)
4. Plano de rollback (revert migration + revert código)
5. Comandos executados + resultado
6. O que ficou fora
```

Toda mudança de banco precisa de migração reversível:
```sql
-- forward
ALTER ...;
-- backward (comentário no PR)
-- ALTER ... RESTORE ...;
```

---

## 6. Decisão sobre ordem de execução

Confirmada a ordem ajustada pelo usuário:

```text
0. Pré-flight ✅ (este documento)
1. S-P0.1 Inventário ✅ (este documento)
2. S-P0.2 SECURITY DEFINER search_path ⏭️ (já remediado — 0 pendentes)
3. S-P0.3 EXECUTE allowlist de RPC 📋 (requer staging — próxima rodada)
4. S-P0.4 Storage multi-tenant ⏭️ (já remediado — 0 pendentes)
5. S-P0.5 ack-job trigger no banco 📋 (mitigação atual no edge; trigger DB sugerido — próxima rodada)
6. Q-P0 dead-code + no-case-declarations ✅ (já corrigido)
7. P-P0 select('*') + React Query 📋 (próxima rodada)
8. S-P1 Zod strict, audit API Key, CORS/log 📋
9. Q-P1 hooks deps, any, unused vars, refresh 📋
10. P-P1 N+1, re-render, bundle 📋
11. P2 apenas catalogar 📋
```

**Resultado do pré-flight**: 3 dos 4 itens S-P0 originais **já estão remediados** (search_path, storage, ack-job na camada de aplicação). Próxima rodada deve focar em:

1. **S-P0.5** — trigger no banco como defesa em profundidade do `ack-job`.
2. **S-P0.3** — auditoria de `EXECUTE` em SECURITY DEFINER (61 authenticated + 4 anon).
3. **P-P0** — substituir `select('*')` (45 arquivos).

Nenhuma migração será disparada sem aprovação explícita de PR específico.
