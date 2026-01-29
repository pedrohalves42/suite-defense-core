
# Plano: Migrar Dashboard e AgentMonitoring para usar RPCs

## Status: ✅ CONCLUÍDO

## Diagnóstico Final

### Situação Atual
- ✅ RPC `get_agents_list` existe e funciona corretamente (retorna 3 agentes)
- ✅ RPC `get_agents_snapshots_list` atualizada
- ✅ Views `agents_safe` e `agent_snapshots` atualizadas com fallback
- ✅ **Dashboard.tsx** migrado para usar RPC `get_agents_list`
- ✅ **AgentMonitoring.tsx** migrado para usar RPC `get_agents_list`

### Por que a view não funciona mesmo com fallback?

O fallback na view depende de `auth.uid()` para verificar `user_roles`, mas quando o frontend faz a query, mesmo com o fallback, ainda há uma race condition onde:
1. O JWT pode não ter o `active_tenant_id` claim
2. E o `user_roles` check pode falhar se a sessão não estiver completamente sincronizada

**Solução implementada**: Usar RPCs com parâmetro `p_tenant_id` explícito, que funcionam independentemente do estado do JWT.

---

## Arquivos Modificados

| Arquivo | Status | Alteração |
|---------|--------|-----------|
| `src/pages/admin/Dashboard.tsx` | ✅ | Migrado para RPC `get_agents_list` |
| `src/pages/AgentMonitoring.tsx` | ✅ | Migrado para RPC `get_agents_list` (2 queries) |
| `src/hooks/useAgentSyncStatus.tsx` | ✅ | Já estava usando RPC |

---

## Validação

A RPC `get_agents_list` para o tenant "Pedro Alves" retorna corretamente 3 agentes:
- `pcteste1` (healthy, heartbeat ativo)
- `PCteste2` (healthy, heartbeat recente)
- `MIT-SERVIDOR` (healthy, heartbeat ativo)

---

## Resultado Esperado

- ✅ Dashboard mostra contagem correta de agentes
- ✅ AgentMonitoring mostra lista completa de agentes
- ✅ Sistema resiliente a race conditions de sincronização JWT
- ✅ Usa RPC SECURITY DEFINER com parâmetro explícito
