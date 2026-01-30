
## Objetivo
Resolver todos os erros identificados nas screenshots:
1. **"o.eq is not a function"** na página de Atualizações de Segurança (VulnerabilityFindings)
2. **"Jobs: Crítico"** - Status crítico no pipeline mesmo com jobs funcionando
3. **Modal "Adicionar Computadores"** mostrando vazio quando tem agentes disponíveis
4. **Erros 403** em `agent_tokens` e `agent_releases` (já corrigidos parcialmente)
5. **Erro "column started_at does not exist"** em `scheduled_job_runs`

---

## Diagnóstico Final

### Problema 1: "o.eq is not a function" na Vulnerabilities
**Causa**: O `tenantQuery()` helper retorna um objeto query com `.eq()` já aplicado. Quando você chama `.eq()` novamente sobre o resultado, está chamando em um tipo diferente.

**Arquivo**: `src/lib/tenantQuery.ts` linha 98 retorna `query.eq('tenant_id', tenantId)`, e depois `src/hooks/useVulnFindings.tsx` linha 8-11 chama `.eq('agent_id', agentId)` **sobre** esse resultado.

O problema é que `tenantQuery()` retorna o resultado de `.eq()`, que é um `PostgrestFilterBuilder`, não um `PostgrestQueryBuilder`. Isso deveria funcionar, MAS há um bug quando a tabela está na lista `MULTI_TENANT_TABLES` e o cast `as any` na linha 98 pode perder a tipagem correta.

**Solução**: Verificar se o retorno de `tenantQuery` está encadeando corretamente. O erro "o.eq is not a function" indica que `tenantQuery()` está retornando algo que não é o builder esperado.

### Problema 2: "Jobs: Crítico" no Pipeline
**Causa**: O `usePipelineHealth.ts` considera "crítico" qualquer signal que não teve atividade nos últimos 30 minutos. Os jobs em `queued` status nunca foram entregues/completados, então `last_seen_at` para jobs está mostrando dados antigos.

**Análise do banco**:
- 19 jobs em status `queued` (não processados)
- 2 jobs em status `pending` 
- Último job completado: `2026-01-30 11:22:18` (antes do critério de frescor)

Os agentes estão online (heartbeat < 1 min atrás) mas não estão processando jobs. Isso é um problema operacional, não de código.

### Problema 3: Modal "Adicionar Computadores" Vazio
**Causa**: O `useAvailableAgents` hook em `src/hooks/useAgentGroups.tsx` linha 214-219 ainda usa `agents_safe` view:
```typescript
const { data: allAgents, error: agentsError } = await supabase
  .from('agents_safe')
  .select('id, agent_name, display_name, hostname, status')
  .eq('tenant_id', tenant.id)
```

Quando o JWT não tem o claim `active_tenant_id`, a view retorna vazio mesmo com filtro explícito.

**Tenant afetado**: O grupo "Funcionarios_Bmg" pertence ao tenant "Genial Cred" (11 agentes), mas a query retorna 0.

### Problema 4: Erro "column started_at does not exist" em scheduled_job_runs
**Causa identificada nos logs**: Algum código tenta acessar `started_at` na tabela `scheduled_job_runs`, mas essa coluna não existe. A tabela tem apenas: `id, job_key, ran_at, duration_ms, success, error, result, processed_count, tenant_id, created_at, job_source`.

**Possível fonte**: Uma view ou RPC está referenciando `started_at` erroneamente.

### Problema 5: Erros 403 em agent_tokens/agent_releases
**Status**: Parcialmente corrigido. As policies de SELECT já existem:
- `agent_tokens`: Policy "Users can view tokens for agents in their tenant" existe
- `agent_releases`: Policy "Authenticated users can view active releases" existe

Mas a policy de `agent_tokens` usa `get_active_tenant_id()` que pode ser NULL, causando falha.

---

## Implementação

### Fase A: Corrigir "o.eq is not a function" (P0)

O problema está no `tenantQuery()` que retorna `(query as any).eq('tenant_id', tenantId)`. O cast `as any` perde tipagem e pode causar problemas em runtime.

**Correção** em `src/lib/tenantQuery.ts`:

```typescript
export function tenantQuery<T extends TableName>(
  table: T,
  tenantId: string | undefined
) {
  const isMultiTenant = MULTI_TENANT_TABLES.has(table);

  if (isMultiTenant && !tenantId) {
    throw new Error(
      `[tenantQuery] tenant_id obrigatório para tabela "${table}".`
    );
  }

  const query = supabase.from(table);

  // CORREÇÃO: Retornar query builder diretamente, deixar o .eq para o chamador
  // Isso mantém a tipagem correta e evita "o.eq is not a function"
  if (isMultiTenant && tenantId) {
    // Retorna o builder com o filtro aplicado corretamente
    return query.eq('tenant_id', tenantId);
  }

  return query;
}
```

**OU** alternativa mais segura - usar `supabase.from()` diretamente no `useVulnFindings.tsx`:

```typescript
async function fetchVulnFindings(agentId: string, tenantId: string): Promise<VulnFinding[]> {
  // CORREÇÃO: Usar supabase.from() diretamente ao invés de tenantQuery
  const { data, error } = await supabase
    .from('vuln_findings')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('agent_id', agentId)
    .order('severity', { ascending: false })
    .order('first_seen_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch vulnerability findings: ${error.message}`);
  }

  return data || [];
}
```

### Fase B: Corrigir Modal "Adicionar Computadores" (P0)

**Arquivo**: `src/hooks/useAgentGroups.tsx` linhas 204-238

**Correção**: Migrar de `agents_safe` para RPC `get_agents_list`:

```typescript
export function useAvailableAgents(groupId: string | null) {
  const { tenant, loading } = useTenant();

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['available-agents-for-group', tenant?.id, groupId],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      // CORREÇÃO: Usar RPC get_agents_list ao invés de agents_safe
      const { data: allAgents, error: agentsError } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenant.id,
        p_include_archived: false
      });
      
      if (agentsError) throw agentsError;

      // Mapear para formato esperado
      const mappedAgents = (allAgents || []).map((agent: any) => ({
        id: agent.id,
        agent_name: agent.agent_name,
        display_name: agent.display_name || agent.agent_name,
        hostname: agent.hostname,
        status: agent.status,
      }));

      if (!groupId) return mappedAgents;

      // Get agents already in this group
      const { data: groupMembers, error: membersError } = await supabase
        .from('agents_groups')
        .select('agent_id')
        .eq('group_id', groupId);
      if (membersError) throw membersError;

      const memberIds = new Set(groupMembers?.map(m => m.agent_id) || []);
      return mappedAgents.filter(agent => !memberIds.has(agent.id));
    },
    enabled: !loading && !!tenant?.id,
  });

  return { agents, isLoading };
}
```

### Fase C: Corrigir Jobs Pipeline Status (P1)

O status "Jobs: Crítico" está correto - indica que os jobs não estão sendo processados. Os agentes estão online mas não estão consumindo jobs.

**Causa provável**: Os agentes não estão chamando `poll-jobs` ou há um problema no ciclo de polling.

**Diagnóstico adicional necessário**:
- Verificar se os agentes estão fazendo polling corretamente
- Verificar logs do Edge Function `poll-jobs`
- Verificar se há erros no agente que impedem o processamento

**Ação imediata (UI)**: Não é erro de código frontend. O indicador está correto.

### Fase D: Corrigir Erro 403 em agent_tokens (P1)

A policy atual usa `get_active_tenant_id()` que pode ser NULL:

```sql
-- Política atual problemática
USING (((get_active_tenant_id() IS NOT NULL) AND (...)))
```

**Correção SQL**:

```sql
-- Remover policy problemática e criar nova usando user_roles
DROP POLICY IF EXISTS "agent_tokens_select_active_tenant" ON agent_tokens;

CREATE POLICY "agent_tokens_select_via_user_roles"
ON agent_tokens FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM agents a
    JOIN user_roles ur ON ur.tenant_id = a.tenant_id
    WHERE a.id = agent_tokens.agent_id
    AND ur.user_id = auth.uid()
  )
);
```

### Fase E: Investigar Erro started_at (P2)

O erro "column scheduled_job_runs.started_at does not exist" apareceu nos logs do banco. Precisa encontrar qual código está fazendo essa query.

**Busca realizada**: Não encontrei referências diretas a `scheduled_job_runs.started_at` no código. Pode ser:
1. Uma view desatualizada
2. Uma RPC que não foi migrada
3. Cache de types desatualizado

**Ação**: Verificar a view `v_job_health` e outras views/RPCs que usam `scheduled_job_runs`.

---

## Resumo de Entregáveis

| Arquivo | Mudança | Prioridade |
|---------|---------|------------|
| `src/hooks/useVulnFindings.tsx` | Usar `supabase.from()` ao invés de `tenantQuery()` | P0 |
| `src/hooks/useAgentGroups.tsx` | Migrar `useAvailableAgents` para RPC `get_agents_list` | P0 |
| SQL Migration | Corrigir RLS de `agent_tokens` | P1 |
| Diagnóstico | Verificar por que agentes não processam jobs | P1 |

---

## Validação

1. **VulnerabilityFindings**:
   - Navegar para `/admin/vulnerability-findings`
   - Selecionar um computador
   - Confirmar que não aparece "o.eq is not a function"

2. **Grupos de Computadores**:
   - Navegar para `/admin/agent-groups`
   - Selecionar grupo "Funcionarios_Bmg"
   - Clicar "Adicionar Computadores"
   - Confirmar que lista os 11 agentes do Genial Cred

3. **Pipeline Health**:
   - O status "Jobs: Crítico" deve mudar para "Fresh" quando os agentes voltarem a processar jobs
   - Isso requer investigação operacional nos agentes

4. **Console**:
   - Não deve mostrar erro 403 para `agent_tokens`
