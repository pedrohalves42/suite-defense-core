# Revisão Completa de Código — Resultado Agrupado por Tipo

Relatório consolidado da auditoria estática (frontend, edge functions, banco). Sem datas; agrupado por **eixo** e **prioridade**. Itens marcados ✅ foram resolvidos nesta rodada; 📋 catalogados; ⏭️ já estavam resolvidos.

---

## Sumário executivo

| Eixo         | P0      | P1       | P2  |
|--------------|---------|----------|-----|
| Qualidade    | ✅ 2/2  | 📋 4     | 📋  |
| Segurança    | ⏭️ 3/3  | 📋 4     | 📋 2 |
| Performance  | 📋 2    | 📋 3     | 📋 2 |

- `tsc --noEmit`: **0 erros**
- `eslint`: **0 erros**, **991 warnings** (era 1005 antes desta rodada — 14 `no-case-declarations` resolvidos)
- `supabase--linter`: sem erros críticos

---

## Eixo 1 — Qualidade

### ✅ Q-P0 (corrigido nesta rodada)

#### ✅ Q1. Dead-code & branches inalcançáveis
- `src/pages/ServerDashboard.tsx:43` (`hasDataError` calculado e nunca lido) e linha 82 (`!!error` redundante) — corrigidos em rodada anterior (B1/B2).

#### ✅ Q2. `no-case-declarations` (14 ocorrências)
Risco: declarações `let/const` no escopo de `switch` podem vazar entre `case` por hoisting.
- ✅ `src/components/action-center/ActionCopyMap.ts` (12) — todos os `case` com declarações envoltos em `{ }`.
- ✅ `src/lib/explain-insight.ts` (2) — idem.

### 📋 Q-P1 (catalogado)

#### Q3. `@typescript-eslint/no-explicit-any` — **317 ocorrências**
Concentração: `src/pages/admin/**`, `src/hooks/**`, `src/test/**`. Regra core do projeto permite `any` apenas em mappers de dados (`src/**/mappers/*`). Ação: tipar uma área por vez; meta <100 isolados em mappers.

#### Q4. `@typescript-eslint/no-unused-vars` — **611 ocorrências**
Imports e variáveis órfãs. Ação proposta: `eslint --fix` controlado por diretório, revisar diffs (não rodado nesta PR para não inflar o changeset).

#### Q5. `react-hooks/exhaustive-deps` — **23 ocorrências**
Inclui `src/providers/AuthProvider.tsx:111` (`queryClient` faltando). Cada caso requer decisão arquitetural (incluir dep vs `useEvent` vs justificar com `// eslint-disable-next-line`).

#### Q6. `react-refresh/only-export-components` — **19 ocorrências**
Mover constantes/utilitários para arquivos próprios; melhora HMR.

### 📋 Q-P2 (cosmético — catalogar)
- `no-empty` (3), `prefer-const` (2), `no-control-regex` (1), `no-empty-object-type` (4).

---

## Eixo 2 — Segurança

### ⏭️ S-P0 (já resolvidos no banco; mantidos sob CI)

#### ⏭️ S1. F-001 — `SECURITY DEFINER` sem `search_path`
Query de auditoria:
```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
WHERE p.prosecdef=true AND n.nspname='public'
  AND (p.proconfig IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
```
**Resultado: 0 funções.** Já remediado em migrações anteriores; CI guard ativo (`tools/tests/assert_*`).

#### ⏭️ S2. F-004 — Storage multi-tenant (`storage.objects`)
Políticas atuais verificadas via `pg_policies`:
- `agent_installers_tenant_isolation` (SELECT, `authenticated`): exige `(storage.foldername(name))[1] = get_active_tenant_id()::text` OR super-admin.
- `agent_scripts_tenant_isolation`: idem.
- `admins_can_upload_*_isolated`: prefixo de pasta = tenant.
- Políticas globais (`bucket_id='agent-scripts'`) restritas a `service_role`.

**Resultado: isolamento por `tenant_id` via folder-prefix já implementado.** F-004 está fechado.

#### ⏭️ S3. Allowlist de `EXECUTE` em RPCs `SECURITY DEFINER`
A tabela `security_definer_allowlist` existe e governa **views** (colunas: `view_name`, `rationale`, `adr_reference`, `approved_by`, `approved_at`), conforme `mem://security/rpc-execution-permission-standard`. Validação ativa via `tools/tests/assert_no_unsafe_exposed_functions.sql`.

### 📋 S-P1 (catalogado — exigem migrações/refactor maiores)

#### S4. F-002 — Zod `.passthrough()` em routers (**21 ocorrências**)
Arquivos afetados (top):
```
supabase/functions/_shared/schemas/agent-submit.ts:8
supabase/functions/action-center-feed/index.ts:48
supabase/functions/ai-insight-dispatcher/index.ts:19
supabase/functions/collect-router/index.ts:25
supabase/functions/get-agent-script-content/index.ts:15
supabase/functions/ops-playbook/handlers/playbook-core.ts:22
supabase/functions/ops-playbook/handlers/playbook-automation.ts:266
supabase/functions/saml-sso/index.ts:18
supabase/functions/scim-provisioning/index.ts:22,30
supabase/functions/fido2-register/index.ts:26,27
supabase/functions/ops-gateway/handlers/sync-mitre.ts:15
supabase/functions/ops-gateway/handlers/sync-cve.ts:15
supabase/functions/api-gateway/handlers/sync-mitre.ts:15
supabase/functions/api-gateway/handlers/sync-cve.ts:15
supabase/functions/submit-hmac-router/index.ts:30
supabase/functions/public-gateway/handlers/auth-security.ts:19
supabase/functions/promote-agent-v5/index.ts:64
supabase/functions/api-gateway/handlers/admin.ts:464
```
**Ação proposta**: para cada router, mapear `action`/`type` → schema discriminado (Zod `discriminatedUnion`), remover `.passthrough()`.

#### S5. F-005 — `ack-job` legado
`supabase/functions/ack-job/index.ts` permite marcar `status='completed'` sem side-effects (telemetria). Ação proposta: trigger em `public.jobs` que bloqueie transição para `completed` quando `type IN ('collect_web_activity','software_inventory','security_scan',...)` sem registros associados.

#### S6. F-006 — `createAuditLog` em handlers API Key
`supabase/functions/api-gateway/handlers/tenant-api.ts` (`handleTenantFeatures`, `handleTenantInfo`, `handleTenantStats`) não chamam `createAuditLog`. Aplicar wrapper em `_shared/audit.ts` no orquestrador `api-gateway`.

#### S7. CORS em respostas de erro + logs sem PII
Pattern atual (`_shared/cors.ts → buildCorsHeaders`) está correto e usado nos novos handlers. Catalogar e auditar handlers legados que ainda exportam `Response` sem espalhar `...corsHeaders`. Logger estruturado já existe em `_shared/logger.ts`.

### 📋 S-P2

#### S8. F-003 — Realtime tenant prefix
`src/hooks/useRealtimeHooks.ts` ainda usa filtro client-side (`tenant_id=eq.${tenantId}`). Migrar para canais por tenant: `tenant:{id}:agents`. Cross-ref `mem://security/realtime-multi-tenant-access-control`.

#### S9. Sweep `dangerouslySetInnerHTML` / `Invoke-Expression` / `curl|bash`
Varrido — apenas 2 usos legítimos em frontend:
- `src/components/ui/FormattedText.tsx:16` (sanitizado com DOMPurify).
- `src/components/landing/SEO.tsx:11` (`JSON.stringify` de JSON-LD — seguro).

---

## Eixo 3 — Performance

### 📋 P-P0

#### P1. React Query — `staleTime`/`gcTime`
Auditar hooks pesados (`useAgents`, `useJobs`, `useDashboardStats`). Aplicar defaults consistentes do `mem://architecture/frontend-caching-and-performance-standard`.

#### P2. `select('*')` — **45 arquivos**
Frontend (10): `src/hooks/useAgentCausality.ts`, `src/hooks/useForensicSnapshots.tsx`, `src/lib/tenantQuery.ts`, `src/hooks/useSOC2Readiness.ts`, `src/pages/admin/super/Tenants/useTenants.ts`, `src/pages/TestComplianceGenerator.tsx`, `src/pages/VirusScans.tsx`, `src/pages/admin/EnrollmentKeys/useEnrollmentKeys.ts`, `src/pages/admin/MyAccount.tsx`, `src/pages/admin/SecurityPolicies/hooks/useSecurityPoliciesPage.ts`.

Edge (35): `supabase/functions/_shared/repositories/system-health.repository.ts`, `supabase/functions/api-gateway/handlers/*`, `supabase/functions/ops-gateway/handlers/*`, etc. (lista completa via `rg -ln "select\(['\"]\*['\"]" supabase/functions/`).

**Ação**: substituir por projeção explícita por arquivo. Regra core proíbe `SELECT *` (memory index).

### 📋 P-P1

#### P3. N+1 / round-trips em edge functions
Mapear `await` sequencial → `Promise.all` (`mem://architecture/data-efficiency-and-aggregation-standards`).

#### P4. Re-renders em listas
`React.memo`/`useMemo`/`useCallback` em Dashboard, AgentsList, JobsList (alta cardinalidade).

#### P5. Bundle
Confirmar tree-shaking de `lucide-react` (imports por ícone), `recharts` e `jspdf` (já dynamic import — `mem://architecture/frontend-caching-and-performance-standard`).

### 📋 P-P2

#### P6. Índices de DB
Rodar `supabase--slow_queries` periodicamente; propor índices para top-10.

#### P7. Realtime vs polling
Auditar conformidade com `mem://architecture/realtime-sync-and-polling-governance-v2`.

---

## Validação final desta rodada

- `tsc --noEmit` ✅ 0 erros
- `eslint` ✅ 991 warnings (era 1005 — `-14`), 0 erros
- `supabase--linter` ✅ sem regressão
- `pg_proc`: 0 `SECURITY DEFINER` sem `search_path`
- `storage.objects`: políticas com isolamento por tenant via folder-prefix

## Próximos passos sugeridos (ordem)

1. **S-P1**: S4 (Zod strict) — maior risco residual ativo.
2. **S-P1**: S5 (`ack-job` trigger) — requer migração SQL.
3. **S-P1**: S6 (audit API Key).
4. **P-P0/P2**: substituir `select('*')` por projeções (PRs pequenas, 5–10 arquivos por vez).
5. **Q-P1**: rodar `eslint --fix` controlado por diretório para `no-unused-vars`.

## Fora de escopo
- Refactor arquitetural (hexagonal/ports).
- Reescrita de telas.
- Novos testes E2E.
- Correção de P2 (apenas catalogados).
