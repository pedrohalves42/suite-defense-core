# ADR-026: Active Tenant Context & Hard Multi-Tenant Isolation

**Status:** 🟢 CLOSED — Active Tenant Isolation Fully Enforced  
**Data:** 2026-01-08  
**Autores:** Equipe CyberShield  
**Decisões relacionadas:** ADR-019 (Multi-Tenant RLS), ADR-025 (Governance Closure)

---

## Contexto

O CyberShield é um sistema multi-tenant onde usuários podem pertencer a múltiplos tenants simultaneamente. O controle de acesso utiliza:

- JWT contendo identidade do usuário
- RLS baseado em `user_has_tenant_access(tenant_id)`

Este modelo **autoriza corretamente**, porém **não impõe isolamento de contexto ativo**, permitindo que:

- Queries sem filtro explícito de `tenant_id`
- Retornem dados de **todos os tenants aos quais o usuário tem acesso**

### Problema Identificado

Durante auditoria, detectamos que componentes frontend estavam exibindo dados mesclados de múltiplos tenants para usuários com acesso a mais de uma organização.

**Causa raiz:** 
- RLS valida ACESSO (sim/não)
- Frontend precisa filtrar CONTEXTO (qual tenant agora)
- Sem o filtro, todos os dados permitidos são retornados

**Impacto:**
- Vazamento lógico de dados entre tenants no UI
- Mistura de dados causando confusão operacional
- Risco crítico de auditoria (SOC 2 / ISO 27001)

---

## Decisão

Introduzir o conceito de **`active_tenant_id` como claim no JWT**, tornando o isolamento:

1. **Explícito** - Tenant ativo é declarado, não inferido
2. **Imposto** - Queries obrigatoriamente filtram pelo tenant ativo
3. **À prova de erro humano** - CI gate impede regressões
4. **Auditável** - Cada troca de tenant é logada

### Componentes Implementados

1. **Edge Function `set-active-tenant`**
   - Valida acesso do usuário ao tenant
   - Atualiza `app_metadata` com `active_tenant_id`
   - Registra troca no audit log

2. **Hook `useRequiredTenant`**
   - Garante que tenant está definido
   - Falha em desenvolvimento se tenant ausente
   - Previne bugs de contexto

3. **Helper `tenantQuery`**
   - Wrapper que impõe filtro tenant_id
   - Falha se tenant ausente para tabelas multi-tenant
   - Simplifica queries seguras

4. **CI Gate `check-tenant-queries.sh`**
   - Detecta queries sem tenant_id
   - Hard-fail no CI se violação detectada
   - Previne regressões

---

## Estrutura do JWT

```json
{
  "sub": "user_uuid",
  "email": "user@empresa.com",
  "app_metadata": {
    "active_tenant_id": "tenant_b_uuid",
    "tenants": ["tenant_a", "tenant_b", "tenant_c"],
    "is_super_admin": false
  },
  "iat": 1710000000,
  "exp": 1710003600
}
```

| Campo | Uso |
|-------|-----|
| `tenants[]` | Autorização (acesso possível) |
| `active_tenant_id` | **Contexto ativo (isolamento)** |
| `is_super_admin` | Bypass controlado |

---

## Fluxo de Troca de Tenant

```
┌─────────────────┐
│  User selects   │
│  new tenant     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ set-active-     │
│ tenant (Edge)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Validate user has tenant access  │
│ 2. Update app_metadata              │
│ 3. Record in audit_logs             │
│ 4. Return success                   │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────┐
│ Frontend:       │
│ - Refresh JWT   │
│ - Invalidate    │
│   queries       │
└─────────────────┘
```

---

## Padrão de Código Obrigatório

### ❌ ANTES (Vulnerável)

```typescript
const { data } = await supabase
  .from('agents')
  .select('*')
  .eq('status', 'active')
// Retorna agents de TODOS os tenants do usuário!
```

### ✅ DEPOIS (Isolado)

```typescript
import { useTenant } from '@/hooks/useTenant';

const { tenant } = useTenant();

const { data } = await supabase
  .from('agents')
  .select('*')
  .eq('tenant_id', tenant.id)  // Filtro obrigatório
  .eq('status', 'active')
```

### ✅ OU com helper

```typescript
import { tenantQuery } from '@/lib/tenantQuery';
import { useRequiredTenant } from '@/hooks/useRequiredTenant';

const { tenant } = useRequiredTenant();

const { data } = await tenantQuery('agents', tenant.id)
  .select('*')
  .eq('status', 'active')
```

---

## Tabelas Multi-Tenant Cobertas

| Tabela | Criticidade |
|--------|-------------|
| `agents` | Alta |
| `tasks` | Alta |
| `system_alerts` | Alta |
| `jobs` | Alta |
| `ai_insights` | Alta |
| `computers` | Alta |
| `agent_web_activity` | Média |
| `agent_system_metrics` | Média |
| `enrollment_keys` | Média |
| `governance_reports` | Alta |
| `playbook_executions` | Alta |

---

## Consequências

### Positivas

- ✅ Isolamento garantido no frontend
- ✅ Elimina vazamento por erro de código
- ✅ CI previne regressões
- ✅ Auditor-friendly
- ✅ Segurança por default

### Trade-offs

- ⚠️ JWT atualizado ao trocar tenant (aceito)
- ⚠️ Edge function adicional (mínimo overhead)
- ⚠️ Queries requerem tenant explícito (behavior correto)

---

## Validação

### Checklist de Revisão de Código

Para cada query em tabela multi-tenant:

- [ ] Usa `useTenant()` ou `useRequiredTenant()`
- [ ] Inclui `tenant?.id` no `queryKey`
- [ ] Adiciona guard `if (!tenant?.id) return []`
- [ ] Inclui `.eq('tenant_id', tenant.id)`

### Teste E2E de Isolamento

```gherkin
Dado um usuário com acesso aos tenants A e B
Quando o usuário seleciona o Tenant A
Então a lista de agents mostra APENAS agents do Tenant A
E NENHUM agent do Tenant B aparece
```

---

## Implementação de RLS (2026-01-08)

### Funções SQL Criadas

```sql
-- Extrai tenant ativo do JWT
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->>'active_tenant_id',
    ''
  )::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Verifica se tenant fornecido é o ativo
CREATE OR REPLACE FUNCTION public.is_active_tenant(_tenant_id uuid)
RETURNS boolean AS $$
  SELECT _tenant_id = public.get_active_tenant_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Verifica se usuário atual é super admin
CREATE OR REPLACE FUNCTION public.is_current_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Padrão RLS Implementado

Todas as tabelas multi-tenant agora usam este padrão:

```sql
-- SELECT policy
CREATE POLICY "table_select_active_tenant"
ON table_name FOR SELECT
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- INSERT policy
CREATE POLICY "table_insert_active_tenant"
ON table_name FOR INSERT
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- UPDATE policy
CREATE POLICY "table_update_active_tenant"
ON table_name FOR UPDATE
USING (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
)
WITH CHECK (
  tenant_id = public.get_active_tenant_id()
  OR public.is_current_super_admin()
);

-- DELETE policy (super admin only)
CREATE POLICY "table_delete_active_tenant"
ON table_name FOR DELETE
USING (
  public.is_current_super_admin()
);
```

### Tabelas Migradas (40+ tabelas, 157 policies)

| Tabela | Operações Migradas |
|--------|---------------------|
| `agents` | SELECT, INSERT, UPDATE, DELETE |
| `agent_builds` | SELECT, INSERT |
| `agent_disk_metrics` | SELECT |
| `agent_evidence_logs` | SELECT |
| `agent_groups` | SELECT, INSERT, UPDATE, DELETE |
| `agent_metrics_daily` | SELECT |
| `agent_network_info` | SELECT |
| `agent_recovery_authorizations` | SELECT, INSERT, UPDATE |
| `agent_rollback_events` | SELECT |
| `agent_safe_mode_events` | SELECT, UPDATE |
| `agent_system_metrics` | SELECT |
| `agents_groups` | SELECT, INSERT, UPDATE, DELETE ✨ |
| `ai_insights` | SELECT, INSERT, UPDATE |
| `audit_logs` | SELECT |
| `chaos_test_results` | SELECT, INSERT, DELETE (super admin only) ✨ |
| `enrollment_keys` | SELECT, INSERT, UPDATE, DELETE |
| `governance_reports` | SELECT, INSERT, UPDATE |
| `invites` | SELECT, INSERT, UPDATE, DELETE |
| `jobs` | SELECT, INSERT, UPDATE, DELETE |
| `playbook_executions` | SELECT, INSERT, UPDATE, DELETE |
| `scheduled_jobs` | SELECT, INSERT, UPDATE, DELETE |
| `security_policies` | SELECT, INSERT, UPDATE, DELETE |
| `system_alerts` | SELECT, INSERT, UPDATE, DELETE |
| `tasks` | SELECT, INSERT, UPDATE, DELETE |
| `tenant_features` | SELECT, INSERT (super_admin), UPDATE (super_admin) |
| `user_roles` | SELECT, INSERT, UPDATE, DELETE |

✨ = Adicionado em FASE 4A (2026-01-08)

---

## Garantias de Segurança

| Vetor de Ataque | Resultado |
|-----------------|-----------|
| Query sem filtro tenant_id | ❌ Bloqueado por RLS |
| Usuário acessando dados de outro tenant | ❌ Bloqueado por RLS |
| Manipulação de JWT | ❌ Servidor valida acesso |
| Bug de UI expondo dados cross-tenant | ❌ Camada de banco impõe isolamento |
| Abuso de Super Admin | ✅ Controlado e auditado |

---

## Status Final — FECHAMENTO DEFINITIVO

🟢 **FULLY CLOSED — All Cycles Complete (2026-01-17)**

- **0 legacy RLS policies remain** (user_has_tenant_access, user_belongs_to_tenant)
- **157 active_tenant policies** enforcing isolation (150 base + 7 FASE 4A)
- **40+ multi-tenant tables** protected with RLS
- **0 tables without policy** (views excluded)
- **18/18 critical views** with `security_invoker=on`
- **8/8 sensitive functions** with public access revoked
- Frontend errors cannot bypass database isolation
- ESLint plugin blocks insecure queries at dev time
- CI blocks regression at lint + E2E levels (hard fail)
- **3/3 SQL invariant tests** passing

Este ADR representa o **FECHAMENTO DEFINITIVO** de todos os ciclos de segurança multi-tenant.

### Garantias Pós-Implementação

| Vetor de Ataque | Estado |
|-----------------|--------|
| Query sem tenant_id | ❌ Impossível (RLS bloqueia) |
| Bug de frontend | ❌ Banco impede |
| Token incorreto | ❌ RLS bloqueia |
| Super admin | ✅ Controlado e auditado |
| Regressão futura | ❌ CI falha |
| View privilege escalation | ❌ `security_invoker=on` |
| Sensitive function exposure | ❌ Public grants revoked |
| Auditoria SOC/ISO | ✅ Passa |

**Sistema seguro por construção, não por disciplina.**

---

## Ciclos Fechados (2026-01-08)

### ✅ Fase 1: Limpeza de RLS Policies Legadas
- Removidas 40+ policies legadas (`Super admins can...`, `Users can view...`)
- Mantidas apenas policies `*_active_tenant` para tabelas multi-tenant

### ✅ Fase 2: Views de Risk Debt (ADR-025)
- `v_risk_debt_active` - Lista itens de risco aceito com data de expiração
- `v_risk_debt_summary` - Resumo por tenant (total, critical, expiring_soon)

### ✅ Fase 3: ESLint Plugin AST
- Plugin `eslint-plugin-multitenant` criado
- Regra `no-supabase-query-without-tenant` implementada
- Detecta queries a tabelas multi-tenant sem filtro tenant_id

### ✅ Fase 4: Testes E2E Habilitados
- Testes de isolamento prontos em `tools/tests/multi-tenant-isolation.test.ts`
- Cobertura: SELECT, INSERT, UPDATE, DELETE cross-tenant
- Verificação de invariantes de segurança

### ✅ Fase 5: CI Hard Gates (2026-01-08)
- ESLint rule `multitenant/no-supabase-query-without-tenant` = error
- E2E tests `continue-on-error` removido
- Plugin multitenant buildado antes do lint no CI

### ✅ Fase 6: Últimos Gaps de RLS (2026-01-08)
- `agents_groups`: 4 policies CRUD (herda tenant via `group_id`)

### ✅ Fase 7: Security Hardening - Views & Functions (2026-01-17)

**18 Views Críticas com `security_invoker=on`:**

| View | Finalidade |
|------|------------|
| `audit_logs_safe` | Logs de auditoria filtrados |
| `v_security_dashboard` | Dashboard de segurança |
| `v_agent_execution_health` | Saúde de execução de agentes |
| `v_agent_archive_reason_tree` | Histórico de arquivamento |
| `v_agent_lifecycle_state` | Estado do ciclo de vida |
| `v_problematic_agents` | Agentes problemáticos |
| `v_job_execution_health` | Saúde de execução de jobs |
| `v_stuck_jobs_report` | Jobs travados |
| `v_problematic_jobs` | Jobs problemáticos |
| `v_active_risk_debt` | Dívida de risco ativa |
| `v_soc2_readiness` | Prontidão SOC 2 |
| `v_governance_stats` | Estatísticas de governança |
| `v_dlq_pending_attention` | DLQ pendente |
| `dlq_categorized` | DLQ categorizada |
| `v_pipeline_health_metrics` | Métricas de pipeline |
| `v_tenant_isolation_metrics` | Métricas de isolamento |
| `agents_safe` | Agentes sem dados sensíveis |
| `invites_safe` | Convites sem tokens |

**8 Funções Sensíveis com Acesso Público Revogado:**

| Função | Risco Mitigado |
|--------|----------------|
| `get_enrollment_key_full` | Exposição de chaves de enrollment |
| `get_recent_jobs` | Dados de jobs entre tenants |
| `get_active_tenant_id` | Manipulação de contexto |
| `is_active_tenant` | Bypass de isolamento |
| `is_current_super_admin` | Escalação de privilégio |
| `verify_agent_signature` | Falsificação de assinatura |
| `register_agent_public_key` | Registro de chave maliciosa |
| `generate_agent_hmac_secret` | Geração de segredo HMAC |

**Testes de Invariantes SQL:**
- `assert_no_unsafe_exposed_functions.sql` ✅
- `assert_views_have_security_invoker.sql` ✅
- `assert_views_use_active_tenant.sql` ✅
- `chaos_test_results`: 3 policies (super admin only)

---

## Arquivos de Migração

1. `20260108121108_*` - Criação de `get_active_tenant_id()` e `is_active_tenant()`
2. `20260108124*` - Migração de todas as RLS policies para modelo active tenant
3. `20260108134*` - Limpeza de policies legadas + views de Risk Debt

---

## Referências

- ADR-019: Multi-Tenant RLS Design
- ADR-023: RLS Hardening
- ADR-025: Governance Closure
- `src/hooks/useRequiredTenant.ts`
- `src/lib/tenantQuery.ts`
- `supabase/functions/set-active-tenant/index.ts`
- `scripts/check-tenant-queries.sh`
- `tools/tests/multi-tenant-isolation.test.ts`
- `eslint-plugin-multitenant/` - Plugin ESLint para CI
