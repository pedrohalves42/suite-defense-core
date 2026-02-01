
# Plano: Corrigir Erro "Não foi possível obter informações deste computador" no Agent Health

## Problema Identificado

O drawer de detalhes do agente exibe "Erro ao carregar dados" com a mensagem "Não foi possível obter informações deste computador" porque:

1. **Hook `useAgentCausality` usa `.single()`**: Este método lança erro `PGRST116` quando a query retorna 0 linhas
2. **Falta loading guard de tenant**: O hook não aguarda a sincronização do JWT antes de executar a query
3. **View `agents_safe` filtra por `get_active_tenant_id()`**: Quando o JWT ainda não tem o claim `active_tenant_id`, a função retorna NULL e a view não encontra o agente

## Evidência do Erro

```
[useAgentCausality] Failed to fetch agent, error: {
  "code": "PGRST116",
  "details": "The result contains 0 rows",
  "hint": null,
  "message": "Cannot coerce the result to a single JSON object"
}
```

## Solução

Modificar o hook `useAgentCausality` para seguir o padrão arquitetural do projeto:

### 1. Adicionar Loading Guard de Tenant
```typescript
import { useActiveTenant } from '@/hooks/useActiveTenant';

export function useAgentCausality(agentId: string | null) {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  
  return useQuery({
    // ...
    enabled: !!agentId && !tenantLoading && !!activeTenant?.id,
    // ...
  });
}
```

### 2. Substituir `.single()` por `.maybeSingle()`
```typescript
const { data: agent, error: agentError } = await supabase
  .from('agents_safe')
  .select('*')
  .eq('id', agentId)
  .eq('tenant_id', activeTenant.id)  // Filtro explícito
  .maybeSingle();  // Não lança erro se retornar 0 linhas

if (!agent) {
  return null;  // Retorna null graciosamente em vez de lançar erro
}
```

### 3. Atualizar Tratamento de Erro no Componente

O `AgentDetailsDrawer` já trata `isError` corretamente, mas quando o hook retorna `null` (agente não encontrado), deve mostrar uma mensagem mais específica.

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAgentCausality.ts` | Adicionar loading guard, usar `.maybeSingle()`, passar tenant_id explícito |

---

## Implementacao

### Mudancas no useAgentCausality.ts

```typescript
// Antes (linha 50-77)
export function useAgentCausality(agentId: string | null) {
  return useQuery({
    queryKey: ['agent-causality', agentId],
    queryFn: async (): Promise<AgentCausality | null> => {
      if (!agentId) return null;

      let agent = null;
      let agentError = null;
      
      try {
        const { data, error } = await supabase
          .from('agents_safe')
          .select('*')
          .eq('id', agentId)
          .single();  // <- Problema aqui
        agent = data;
        agentError = error;
      } catch (e) {
        console.error('[useAgentCausality] Error fetching agent:', e);
        agentError = e;
      }

      if (agentError || !agent) {
        console.warn('[useAgentCausality] Failed to fetch agent, error:', agentError);
        throw new Error('Computador não encontrado');
      }
      // ...
    },
    enabled: !!agentId,
    // ...
  });
}

// Depois
import { useActiveTenant } from '@/hooks/useActiveTenant';

export function useAgentCausality(agentId: string | null) {
  const { activeTenant, loading: tenantLoading } = useActiveTenant();
  
  return useQuery({
    queryKey: ['agent-causality', activeTenant?.id, agentId],
    queryFn: async (): Promise<AgentCausality | null> => {
      if (!agentId || !activeTenant?.id) return null;

      // Buscar via RPC com tenant explícito (mais seguro)
      // ou via query direta com filtros explícitos
      const { data: agent, error: agentError } = await supabase
        .from('agents_safe')
        .select('*')
        .eq('id', agentId)
        .eq('tenant_id', activeTenant.id)  // Filtro explícito de tenant
        .maybeSingle();  // Não lança erro se retornar 0 linhas

      if (agentError) {
        console.warn('[useAgentCausality] Query error:', agentError);
        throw new Error('Erro ao buscar computador');
      }

      if (!agent) {
        // Agente não encontrado - retornar null graciosamente
        console.info('[useAgentCausality] Agent not found:', agentId);
        return null;
      }
      
      // ... resto do código permanece igual ...
    },
    // Loading guard: não executa query até tenant estar sincronizado
    enabled: !!agentId && !tenantLoading && !!activeTenant?.id,
    refetchInterval: 30000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
}
```

---

## Validação Pós-Implementação

1. **Navegar para `/admin/agent-health`**
2. **Clicar em qualquer agente (ex: pcteste1)**
3. **Verificar que o drawer abre corretamente** sem erro
4. **Verificar console**: Não deve haver erro `PGRST116`

---

## Seção Técnica

### Padrão Arquitetural Aplicado

Este fix segue os padrões documentados nas memórias do projeto:

- **`frontend/padrao-query-resiliente-explicit-tenant`**: Usar filtros explícitos `.eq('tenant_id', tenantId)` em vez de depender apenas de views
- **`frontend/tenant-synchronization-loading-guard-standard`**: Guardar queries com `enabled: !loading && !!tenantId`
- **`supabase-single-query-errors`**: Usar `.maybeSingle()` quando há risco de 0 linhas

### Fluxo Corrigido

```text
AgentDetailsDrawer abre
    │
    ├─► useAgentCausality(agentId)
    │       │
    │       ├─► tenantLoading = true? → Query DESABILITADA
    │       │
    │       ├─► activeTenant.id disponível
    │       │       │
    │       │       └─► Query com .maybeSingle() + tenant_id explícito
    │       │               │
    │       │               ├─► Agente encontrado → Retorna dados
    │       │               │
    │       │               └─► Agente não encontrado → Retorna null
    │       │                       │
    │       │                       └─► UI mostra mensagem apropriada
    │       │
    │       └─► Erro de rede → isError = true → UI mostra retry
    │
    └─► Drawer renderiza corretamente
```
