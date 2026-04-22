

# Plano: 3 findings residuais de RLS

## Diagnóstico (confirmado via `pg_policies`)

### 🔴 1. `notification_deliveries` — JWT bypass real
Policy `Tenant isolation for notification_deliveries` filtra por:
```sql
tenant_id = (current_setting('request.jwt.claims')::jsonb ->> 'active_tenant_id')::uuid
```
**Risco:** `request.jwt.claims` reflete o JWT bruto do cliente. Como `active_tenant_id` é claim top-level (não está em `app_metadata`), um atacante pode forjar/alterar essa claim ao emitir um JWT customizado, lendo notificações de qualquer tenant. O padrão correto do projeto é `get_active_tenant_id()` (lê de `profiles`, server-side, não-falsificável).

### 🟡 2. `agent_system_metrics_2026_05` — papel errado
Policy `service_role_all` está atribuída ao role `public` com filtro `auth.role()='service_role'`. Funciona, mas viola o padrão do projeto (todas as outras partições usam `TO service_role`). Risco baixo — o filtro previne execução real por não-service_role —, mas inconsistente e dificulta auditoria/CI.

### 🟡 3. `failed_login_attempts` — block policies sobrepostas
Coexistem policies `PERMISSIVE`:
- `Block all modifications ... INSERT WITH CHECK (false)` + `failed_login_attempts_insert_active_tenant ... WITH CHECK (tenant_id = ...)`
- Mesmo padrão para UPDATE e DELETE.

**Comportamento Postgres:** policies `PERMISSIVE` são unidas por `OR`. A policy de bloqueio (`false`) é silenciosamente ignorada — qualquer linha aceita pela policy de tenant passa. As "block policies" deveriam ser `RESTRICTIVE` (aplicadas como `AND`) para ter efeito real, OU devem ser removidas se a intenção sempre foi permitir o tenant-scoped CRUD.

---

## Mudanças (1 migration única)

### Fix 1 — `notification_deliveries`
```sql
DROP POLICY "Tenant isolation for notification_deliveries" ON public.notification_deliveries;

CREATE POLICY "notification_deliveries_tenant_isolation"
ON public.notification_deliveries
FOR ALL
TO authenticated
USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
WITH CHECK (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());
```

### Fix 2 — `agent_system_metrics_2026_05`
```sql
DROP POLICY "service_role_all" ON public.agent_system_metrics_2026_05;

CREATE POLICY "service_role_all"
ON public.agent_system_metrics_2026_05
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

### Fix 3 — `failed_login_attempts`
Remover as 3 block policies inertes (são no-op por serem PERMISSIVE com `false`), mantendo apenas as 4 policies tenant-scoped já existentes:
```sql
DROP POLICY "Block all modifications to failed_login_attempts_v206" ON public.failed_login_attempts;
DROP POLICY "Block updates to failed_login_attempts_v206" ON public.failed_login_attempts;
DROP POLICY "Block deletes to failed_login_attempts_v206" ON public.failed_login_attempts;
```
*(Alternativa rejeitada: recriar como `RESTRICTIVE false` bloquearia todo CRUD authenticated, quebrando o fluxo legítimo do tenant. As policies tenant-scoped já cobrem o controle de acesso correto.)*

---

## Verificação (pós-migration)

1. `pg_policies` → confirmar que `notification_deliveries` usa `get_active_tenant_id()`, `agent_system_metrics_2026_05` está `TO service_role`, e `failed_login_attempts` tem exatamente 4 policies (SELECT/INSERT/UPDATE/DELETE tenant-scoped).
2. `supabase--linter` → 0 novos warnings.
3. Smoke (`read_query` com SET ROLE authenticated simulado): leitura cross-tenant em `notification_deliveries` retorna 0 linhas.
4. `security--manage_security_finding` → `mark_as_fixed` para os 3 findings.

## Risco / rollback
- **Risco:** baixo. `notification_deliveries` ganha controle mais estrito (super_admin preservado). `agent_system_metrics_2026_05` mantém comportamento idêntico (service_role já bypassava de todo jeito). `failed_login_attempts` perde policies que já eram no-op.
- **Rollback:** reverter migration recria as policies antigas em <1min.

