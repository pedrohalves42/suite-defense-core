
# Plano: Migrar Dashboard e AgentMonitoring para usar RPCs

## Diagnóstico Final

### Situação Atual
- ✅ RPC `get_agents_list` existe e funciona corretamente (retorna 3 agentes)
- ✅ RPC `get_agents_snapshots_list` atualizada
- ✅ Views `agents_safe` e `agent_snapshots` atualizadas com fallback
- ❌ **Dashboard.tsx** ainda usa `supabase.from('agents_safe')` diretamente (linha 59)
- ❌ **AgentMonitoring.tsx** ainda usa `supabase.from('agents_safe')` diretamente (linha 89)

### Por que a view não funciona mesmo com fallback?

O fallback na view depende de `auth.uid()` para verificar `user_roles`, mas quando o frontend faz a query, mesmo com o fallback, ainda há uma race condition onde:
1. O JWT pode não ter o `active_tenant_id` claim
2. E o `user_roles` check pode falhar se a sessão não estiver completamente sincronizada

**Solução definitiva**: Usar RPCs com parâmetro `p_tenant_id` explícito, que funcionam independentemente do estado do JWT.

---

## Arquivos a Modificar

| Arquivo | Linha | Problema | Solução |
|---------|-------|----------|---------|
| `src/pages/admin/Dashboard.tsx` | 54-70 | Usa `agents_safe` view | Migrar para RPC `get_agents_list` |
| `src/pages/AgentMonitoring.tsx` | 85-100 | Usa `agents_safe` view | Migrar para RPC `get_agents_list` |

---

## Implementação

### 1. Dashboard.tsx - Atualizar Query de Agentes

**Antes (linha 54-70):**
```typescript
const { data: agents, isLoading: agentsLoading, isFetched: agentsFetched } = useQuery({
  queryKey: ['dashboard-agents', tenant?.id],
  queryFn: async () => {
    if (!tenant?.id) return [];
    const { data, error } = await supabase
      .from('agents_safe')
      .select('id, agent_name, status, last_heartbeat')
      .eq('tenant_id', tenant.id)
      .is('archived_at', null);
    if (error) throw error;
    return data || [];
  },
  enabled: !tenantLoading && !!tenant?.id,
  refetchInterval: 30000,
});
```

**Depois:**
```typescript
const { data: agents, isLoading: agentsLoading, isFetched: agentsFetched } = useQuery({
  queryKey: ['dashboard-agents', tenant?.id],
  queryFn: async () => {
    if (!tenant?.id) return [];
    // ADR-026: Usar RPC com tenant_id explícito para evitar dessincronização JWT
    const { data, error } = await supabase.rpc('get_agents_list', {
      p_tenant_id: tenant.id,
      p_include_archived: false
    });
    if (error) throw error;
    // RPC retorna jsonb objects, mapear para interface esperada
    return (data || []).map((agent: any) => ({
      id: agent.id,
      agent_name: agent.agent_name,
      status: agent.status,
      last_heartbeat: agent.last_heartbeat,
    }));
  },
  enabled: !tenantLoading && !!tenant?.id,
  refetchInterval: 30000,
});
```

### 2. AgentMonitoring.tsx - Atualizar Query de Agentes

**Antes (linha 85-100):**
```typescript
const { data: initialAgents } = useQuery({
  queryKey: ['agents-monitoring', tenant?.id],
  queryFn: async () => {
    if (!tenant?.id) return [];
    const { data, error } = await supabase
      .from('agents_safe')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('enrolled_at', { ascending: false });
    
    if (error) throw error;
    return data as Agent[];
  },
  enabled: !tenantLoading && !!tenant?.id
});
```

**Depois:**
```typescript
const { data: initialAgents } = useQuery({
  queryKey: ['agents-monitoring', tenant?.id],
  queryFn: async () => {
    if (!tenant?.id) return [];
    // ADR-026: Usar RPC com tenant_id explícito para evitar dessincronização JWT
    const { data, error } = await supabase.rpc('get_agents_list', {
      p_tenant_id: tenant.id,
      p_include_archived: false
    });
    
    if (error) throw error;
    // RPC retorna jsonb objects, mapear e ordenar por enrolled_at
    return ((data || []) as any[])
      .map((agent: any) => ({
        id: agent.id,
        agent_name: agent.agent_name,
        status: agent.status,
        last_heartbeat: agent.last_heartbeat,
        enrolled_at: agent.enrolled_at,
        agent_state: agent.agent_state,
      }))
      .sort((a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime()) as Agent[];
  },
  enabled: !tenantLoading && !!tenant?.id
});
```

### 3. AgentMonitoring.tsx - Atualizar Query de Uptime (linha 163-179)

**Antes:**
```typescript
const { data: agentUptimeData } = useQuery({
  queryKey: ['agent-uptime', tenant?.id],
  queryFn: async () => {
    if (!tenant?.id) return [];
    const { data, error } = await supabase
      .from('agents_safe')
      .select('agent_name, last_heartbeat, enrolled_at')
      .eq('tenant_id', tenant.id);
    
    if (error) throw error;
    return data;
  },
  enabled: !tenantLoading && !!tenant?.id
});
```

**Depois:**
```typescript
const { data: agentUptimeData } = useQuery({
  queryKey: ['agent-uptime', tenant?.id],
  queryFn: async () => {
    if (!tenant?.id) return [];
    // ADR-026: Usar RPC com tenant_id explícito
    const { data, error } = await supabase.rpc('get_agents_list', {
      p_tenant_id: tenant.id,
      p_include_archived: false
    });
    
    if (error) throw error;
    return (data || []).map((agent: any) => ({
      agent_name: agent.agent_name,
      last_heartbeat: agent.last_heartbeat,
      enrolled_at: agent.enrolled_at,
    }));
  },
  enabled: !tenantLoading && !!tenant?.id
});
```

---

## Validação Pós-Implementação

1. **Dashboard**: Deve mostrar 3 agentes para Pedro Alves
2. **Monitoramento**: Deve mostrar 3 agentes com status correto
3. **Consistência**: Mesmos números em todas as telas

---

## Resultado Esperado

- ✅ Dashboard mostra contagem correta de agentes
- ✅ AgentMonitoring mostra lista completa de agentes
- ✅ Sistema resiliente a race conditions de sincronização JWT
- ✅ Usa RPC SECURITY DEFINER com parâmetro explícito
