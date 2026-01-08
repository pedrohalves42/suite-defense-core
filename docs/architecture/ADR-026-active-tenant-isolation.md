# ADR-026: Active Tenant Context & Hard Multi-Tenant Isolation

**Status:** ✅ Accepted  
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

### Tabelas Migradas (18 tabelas)

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
| `ai_insights` | SELECT, INSERT, UPDATE |
| `audit_logs` | SELECT |
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

## Status Final

✅ **Decisão aprovada e obrigatória para todas as tabelas multi-tenant.**

Este ADR representa o fechamento da vulnerabilidade de isolamento lógico multi-tenant identificada em auditoria.

---

## Arquivos de Migração

1. `20260108121108_*` - Criação de `get_active_tenant_id()` e `is_active_tenant()`
2. `20260108124*` - Migração de todas as RLS policies para modelo active tenant

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
