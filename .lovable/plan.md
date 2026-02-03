

# Plano: Correção dos 5 Findings do Security Scanner

## Resumo Executivo

O scanner detectou **5 erros** que precisam ser analisados. Após investigação, identificamos:

| Finding | Status | Ação Necessária |
|---------|--------|-----------------|
| profiles_public exposta | **FALSO POSITIVO** | Documentar - view já tem filtro de tenant |
| agents_public exposta | **FALSO POSITIVO** | Documentar - view já tem filtro de tenant |
| active_agents sem RLS | **REAL** | Revogar grant para `anon` |
| RLS Disabled in Public | **REAL** | Habilitar RLS na partição `agent_system_metrics_2026_03` |
| Security Definer View | **PARCIALMENTE REAL** | Adicionar `security_invoker=on` em `v_cron_health` |

---

## Análise Detalhada

### Finding 1: profiles_public exposta

**Diagnóstico:** O scanner alerta que a view expõe dados de perfil. Porém, a definição da view mostra:

```sql
SELECT id, user_id, username, full_name, created_at
FROM profiles p
WHERE EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = p.user_id 
    AND (ur.tenant_id = get_active_tenant_id() OR is_current_super_admin())
);
```

**Proteções existentes:**
- `security_invoker=on` - RLS do caller é aplicado
- Filtro por `get_active_tenant_id()` - Isolamento de tenant
- SEM grant para `anon` - Apenas `authenticated` pode acessar

**Veredicto:** FALSO POSITIVO. A view é segura.

---

### Finding 2: agents_public exposta

**Diagnóstico:** Similar ao anterior. A view tem:

```sql
WHERE (tenant_id = get_active_tenant_id()) OR is_current_super_admin();
```

**Proteções existentes:**
- `security_invoker=on`
- Filtro de tenant
- SEM grant para `anon`

**Veredicto:** FALSO POSITIVO. A view é segura.

---

### Finding 3: active_agents sem RLS (REAL)

**Diagnóstico:** A view `active_agents` tem:
- `security_invoker=on`
- Filtro de tenant na definição
- **MAS** tem grant para `anon`

**Problema:** Usuários não autenticados poderiam tentar acessar a view. O `security_invoker` protege, mas o grant é desnecessário.

**Correção:**

```sql
REVOKE ALL ON active_agents FROM anon;
```

---

### Finding 4: RLS Disabled in Public (REAL)

**Diagnóstico:** A tabela particionada `agent_system_metrics_2026_03` não tem RLS habilitado.

**Correção:**

```sql
ALTER TABLE agent_system_metrics_2026_03 ENABLE ROW LEVEL SECURITY;

-- Política para service_role (já existe na tabela pai, mas precisa na partição)
CREATE POLICY "service_role_full_access" ON agent_system_metrics_2026_03
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Política para authenticated (leitura do próprio tenant)
CREATE POLICY "authenticated_read_own_tenant" ON agent_system_metrics_2026_03
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());
```

---

### Finding 5: Security Definer View (PARCIALMENTE REAL)

**Diagnóstico:** O linter detectou views sem `security_invoker=on`. Após verificação:

| View | Status |
|------|--------|
| `v_cron_health` | SEM security_invoker - **PRECISA CORRIGIR** |
| Outras views | Já têm `security_invoker=true` |

**Correção:**

```sql
DROP VIEW IF EXISTS v_cron_health;

CREATE VIEW v_cron_health 
WITH (security_invoker = on) AS
SELECT 
  cron_name,
  last_success_at,
  consecutive_failures,
  CASE
    WHEN last_success_at IS NULL THEN 'never_run'
    WHEN consecutive_failures >= 3 THEN 'critical'
    WHEN consecutive_failures >= 1 THEN 'warning'
    WHEN last_success_at < NOW() - INTERVAL '2 hours' 
      AND cron_name LIKE '%15min%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '12 hours' 
      AND cron_name LIKE '%6h%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '48 hours' 
      AND cron_name LIKE '%daily%' THEN 'stale'
    ELSE 'healthy'
  END AS status
FROM cron_health_checks;

GRANT SELECT ON v_cron_health TO authenticated;
GRANT SELECT ON v_cron_health TO service_role;
```

---

### Finding 6 (Warnings): RLS Policy Always True

**Diagnóstico:** Políticas com `USING(true)` detectadas. Todas são para `service_role`:

- `hmac_signatures_2026_*` - service_role only
- `network_anomalies` - service_role INSERT
- `cron_health_checks` - service_role only
- etc.

**Veredicto:** ESPERADO E SEGURO (ADR-023). O service_role só é usado por Edge Functions no backend.

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| SQL Migration | CRIAR | Correções de grants e RLS |

---

## Seção Técnica: SQL Consolidado

```sql
-- ============================================================
-- MIGRAÇÃO: Correção dos Findings do Security Scanner
-- ============================================================

BEGIN;

-- 1. Revogar grant de anon em active_agents
REVOKE ALL ON active_agents FROM anon;
REVOKE ALL ON active_agents FROM PUBLIC;

-- Garantir que apenas authenticated e service_role têm acesso
GRANT SELECT ON active_agents TO authenticated;
GRANT SELECT ON active_agents TO service_role;

-- 2. Habilitar RLS na partição de métricas
ALTER TABLE agent_system_metrics_2026_03 ENABLE ROW LEVEL SECURITY;

-- Política para service_role (backend)
CREATE POLICY "service_role_full_access" ON agent_system_metrics_2026_03
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Política para leitura autenticada
CREATE POLICY "authenticated_read_own_tenant" ON agent_system_metrics_2026_03
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 3. Recriar v_cron_health com security_invoker
DROP VIEW IF EXISTS v_cron_health;

CREATE VIEW v_cron_health 
WITH (security_invoker = on) AS
SELECT 
  cron_name,
  last_success_at,
  consecutive_failures,
  CASE
    WHEN last_success_at IS NULL THEN 'never_run'
    WHEN consecutive_failures >= 3 THEN 'critical'
    WHEN consecutive_failures >= 1 THEN 'warning'
    WHEN last_success_at < NOW() - INTERVAL '2 hours' 
      AND cron_name LIKE '%15min%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '12 hours' 
      AND cron_name LIKE '%6h%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '48 hours' 
      AND cron_name LIKE '%daily%' THEN 'stale'
    ELSE 'healthy'
  END AS status
FROM cron_health_checks;

GRANT SELECT ON v_cron_health TO authenticated;
GRANT SELECT ON v_cron_health TO service_role;

COMMENT ON VIEW v_cron_health IS 
'View de saúde dos crons com security_invoker=on. Usada para monitoramento.';

COMMIT;
```

---

## Ações Pós-Migração

### Documentar Falsos Positivos

Após a migração, os seguintes findings devem ser marcados como "Ignorar" no scanner com justificativa:

1. **profiles_public**: "View tem security_invoker=on e filtro de tenant via get_active_tenant_id(). Sem grant para anon."

2. **agents_public**: "View tem security_invoker=on e filtro de tenant. Sem grant para anon. Conforme ADR-023."

3. **RLS Policy Always True (warnings)**: "Políticas com USING(true) são exclusivas para service_role, conforme ADR-023. Acesso controlado via backend."

---

## Checklist de Validação

```sql
-- 1. Verificar active_agents sem grant para anon
SELECT 
  a.grantee::regrole::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN aclexplode(c.relacl) a ON true
WHERE n.nspname = 'public' AND c.relname = 'active_agents'
  AND a.grantee::regrole::text = 'anon';
-- Deve retornar vazio

-- 2. Verificar RLS habilitado na partição
SELECT relrowsecurity FROM pg_class 
WHERE relname = 'agent_system_metrics_2026_03';
-- Deve retornar true

-- 3. Verificar v_cron_health tem security_invoker
SELECT reloptions FROM pg_class 
WHERE relname = 'v_cron_health' AND relkind = 'v';
-- Deve conter 'security_invoker=on'
```

---

## Resumo Final

| Ação | Impacto |
|------|---------|
| Revogar anon de active_agents | Elimina erro no scanner |
| Habilitar RLS na partição | Elimina erro de RLS disabled |
| Adicionar security_invoker em v_cron_health | Elimina warning de security definer |
| Documentar falsos positivos | Limpa alertas restantes |

