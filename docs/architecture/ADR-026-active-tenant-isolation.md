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

## Status Final

✅ **Decisão aprovada e obrigatória para todas as tabelas multi-tenant.**

Este ADR representa o fechamento da vulnerabilidade de isolamento lógico multi-tenant identificada em auditoria.

---

## Referências

- ADR-019: Multi-Tenant RLS Design
- ADR-025: Governance Closure
- `src/hooks/useRequiredTenant.ts`
- `src/lib/tenantQuery.ts`
- `supabase/functions/set-active-tenant/index.ts`
- `scripts/check-tenant-queries.sh`
