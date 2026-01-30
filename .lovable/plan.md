
# Plano: Correção de Múltiplos Problemas Críticos

## Diagnóstico Completo

### Problema 1: Admin não consegue criar canal de notificação
**Erro**: "new row violates row-level security policy for table 'notification_channels'"

**Causa Raiz**: A política RLS `notification_channels_all_active_tenant` está configurada como `FOR ALL` mas **sem cláusula `WITH CHECK`**. No PostgreSQL, quando uma política `FOR ALL` não tem `WITH CHECK`, ela usa a mesma expressão de `USING` para verificar INSERTs - mas isso depende de `get_active_tenant_id()` retornar um valor.

```sql
-- Política atual (problemática)
USING (
  ((get_active_tenant_id() IS NOT NULL) AND (tenant_id = get_active_tenant_id())) 
  OR is_current_super_admin()
)
WITH CHECK: NULL  -- PROBLEMA: não está definido!
```

**Análise**: Quando o INSERT tenta inserir com `tenant_id = tenant!.id`, a política verifica se `tenant_id = get_active_tenant_id()`. Se o JWT não estiver sincronizado ou `get_active_tenant_id()` retornar NULL, o INSERT é bloqueado.

---

### Problema 2: Drawer do computador abre vazio (sem dados)

**Causa Raiz**: O `AgentDetailsDrawer` usa o hook `useAgentCausality` que consulta a view `agents_safe`. Se `get_active_tenant_id()` retornar NULL (JWT não sincronizado), o fallback da view tenta verificar via `user_roles`, mas pode haver race conditions.

**Evidência**: A imagem 4 mostra o drawer aberto para "Pc-Dani-Planalto" mas completamente vazio - sem dados de estado, sem diagnóstico, sem ações.

---

### Problema 3: Tempo real mostrando máquinas offline incorretamente

**Status**: Os agentes estão online (confirmado via query direta - 11 agentes com heartbeat nos últimos 5 minutos).

**Causa Raiz Provável**: Inconsistência entre o estado no banco e a exibição. Os agentes têm `is_throttled = true` sendo classificados incorretamente como "crítico".

---

## Correções Propostas

### Fase A: Corrigir RLS de notification_channels (P0 - CRÍTICO)

Recriar a política com `WITH CHECK` explícito para INSERT:

```sql
-- Remover política problemática
DROP POLICY IF EXISTS notification_channels_all_active_tenant ON notification_channels;

-- Criar políticas separadas por operação
CREATE POLICY notification_channels_select_authenticated ON notification_channels
  FOR SELECT TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

CREATE POLICY notification_channels_insert_authenticated ON notification_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

CREATE POLICY notification_channels_update_authenticated ON notification_channels
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  )
  WITH CHECK (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );

CREATE POLICY notification_channels_delete_authenticated ON notification_channels
  FOR DELETE TO authenticated
  USING (
    (tenant_id = get_active_tenant_id()) 
    OR is_current_super_admin()
  );
```

---

### Fase B: Corrigir AgentDetailsDrawer com fallback robusto (P0)

**Arquivo**: `src/components/agent/AgentDetailsDrawer.tsx`

Problema: Se `useAgentCausality` falha silenciosamente, o drawer mostra apenas skeleton e depois nada.

**Correção**:
1. Adicionar estado de erro explícito
2. Implementar fallback para buscar dados mínimos diretamente
3. Mostrar mensagem de erro clara com botão "Tentar Novamente"

```typescript
// Modificar o hook para expor erros
const { data: causality, isLoading, isError, refetch } = useAgentCausality(agentId);

// Renderizar estado de erro
{isError && (
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <AlertCircle className="h-10 w-10 text-destructive mb-3" />
    <p className="font-medium text-destructive">Erro ao carregar dados</p>
    <p className="text-sm text-muted-foreground mb-4">
      Não foi possível obter informações deste computador
    </p>
    <Button variant="outline" onClick={() => refetch()}>
      <RefreshCw className="h-4 w-4 mr-2" />
      Tentar Novamente
    </Button>
  </div>
)}
```

---

### Fase C: Melhorar hook useAgentCausality com retry e error handling (P1)

**Arquivo**: `src/hooks/useAgentCausality.ts`

1. Adicionar retry com backoff exponencial
2. Usar `throwOnError: false` para capturar erros graciosamente
3. Adicionar fallback para buscar via RPC se view falhar

```typescript
return useQuery({
  queryKey: ['agent-causality', agentId],
  queryFn: async (): Promise<AgentCausality | null> => {
    if (!agentId) return null;

    // Tentar via view primeiro
    let agent = null;
    let agentError = null;
    
    try {
      const { data, error } = await supabase
        .from('agents_safe')
        .select('*')
        .eq('id', agentId)
        .single();
      agent = data;
      agentError = error;
    } catch (e) {
      agentError = e;
    }

    // Fallback: se view falhar, tentar RPC com tenant_id explícito
    if (agentError || !agent) {
      console.warn('[useAgentCausality] View fallback, trying RPC');
      // RPC pode ter melhor tratamento de tenant
    }

    if (!agent) {
      throw new Error('Computador não encontrado');
    }
    // ... resto do código
  },
  retry: 2,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
});
```

---

### Fase D: Adicionar validação de JWT sync antes de mutations (P1)

**Arquivo**: `src/pages/admin/NotificationChannels.tsx`

Garantir que `get_active_tenant_id()` está sincronizado antes de tentar INSERT:

```typescript
const createChannelMutation = useMutation({
  mutationFn: async (channel: typeof newChannel) => {
    // Verificar se tenant está carregado
    if (!tenant?.id) {
      throw new Error('Empresa não selecionada');
    }

    // Forçar refresh do session para garantir JWT atualizado
    await supabase.auth.refreshSession();

    const { data, error } = await supabase
      .from('notification_channels')
      .insert({
        tenant_id: tenant.id,
        // ...
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
  // ...
});
```

---

## Resumo de Entregáveis

| Prioridade | Problema | Solução | Tipo |
|------------|----------|---------|------|
| **P0** | RLS notification_channels sem WITH CHECK | Recriar políticas com WITH CHECK | SQL Migration |
| **P0** | Drawer vazio sem feedback | Adicionar estado de erro e retry | Frontend |
| **P1** | useAgentCausality falha silenciosamente | Adicionar retry e fallback | Frontend |
| **P1** | JWT sync antes de mutations | Refresh session antes de INSERT | Frontend |

---

## Arquivos a Modificar

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| SQL Migration | Recriar políticas RLS para `notification_channels` |
| `src/components/agent/AgentDetailsDrawer.tsx` | Adicionar tratamento de erro |
| `src/hooks/useAgentCausality.ts` | Adicionar retry e fallback |
| `src/pages/admin/NotificationChannels.tsx` | Refresh session antes de insert |

---

## Validação Pós-Correção

1. **Criar canal de notificação**: 
   - Logar como admin
   - Adicionar canal de email
   - Verificar que salva sem erro de RLS

2. **Abrir drawer do computador**:
   - Clicar em qualquer computador com status "Crítico"
   - Verificar que drawer carrega dados (estado, diagnóstico, ações)

3. **Tempo real**:
   - Verificar que computadores online aparecem corretamente
   - Status "Crítico" só para throttled/isolated, não para todos

---

## Causa Raiz Final

O problema principal é que a política RLS `notification_channels_all_active_tenant` foi criada como `FOR ALL` mas sem `WITH CHECK` explícito. Quando PostgreSQL usa `USING` como `WITH CHECK` implícito para INSERT, a condição `tenant_id = get_active_tenant_id()` falha se houver race condition na sincronização do JWT.

A solução é separar as políticas por operação (SELECT, INSERT, UPDATE, DELETE) com `WITH CHECK` explícito para operações de escrita.
