
# Plano de Fechamento: Gaps Remanescentes + Melhorias de Produção

## Situação Atual (Após Implementação Anterior)

### ✅ O Que Já Foi Implementado Corretamente

| Item | Status | Evidência |
|------|--------|-----------|
| Edge Function `agent-snapshot` | ✅ Completa | `supabase/functions/agent-snapshot/index.ts` |
| View `agent_snapshots` + RPC | ✅ Completa | Migration `20260129125114...sql` |
| Hook `useAgentSnapshot` | ✅ Completo | `src/hooks/useAgentSnapshot.ts` |
| Race conditions DiagnosticsCenter | ✅ Corrigido | Linha 90: `loading: tenantLoading`, linha 114/132: guards |
| Race conditions SystemHealth | ✅ Corrigido | Linha 27: `loading: tenantLoading`, linha 64: guard |
| ActionCard.tsx - agent_id null | ✅ Corrigido | Linhas 189-210: trata insights de sistema |
| RejectInsightDialog - validação | ✅ Corrigido | Linha 56: valida prefixos `offline_`, `alert_`, `system_` |
| AgentMonitoring - agent_state | ✅ Corrigido | Linhas 43-72: prioriza agent_state |
| AgentSelector - loading guard | ✅ Corrigido | Linha 32/55: usa `useActiveTenant` com guard |
| Agentes Linux v4.4.0 FSM | ✅ Completo | SHUTDOWN, FailurePolicy, write_log_dedup, write_health_snapshot, write_incident_summary |
| Agentes macOS v4.4.0 FSM | ✅ Completo | Mesmas funcionalidades que Linux |

---

## 🔴 Gaps Críticos Identificados (Ainda Não Implementados)

### GAP 1: Snapshot em Lista para Dashboards

**Problema**: A Edge Function `agent-snapshot` retorna **1 agente por vez**, mas:
- Dashboard de Monitoramento precisa de lista de todos os agentes
- Saúde do Sistema precisa de contagem agregada
- Isso força queries diretas à tabela `agents`/`agents_safe` ao invés da view canônica

**Solução**: Criar RPC `get_agents_snapshots_list` que retorna todos os snapshots do tenant.

```sql
-- Nova RPC para lista de snapshots
CREATE OR REPLACE FUNCTION get_agents_snapshots_list()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT to_jsonb(s)
  FROM agent_snapshots s;
$$;
```

**Impacto**: Permite que Monitoramento e Dashboard usem a mesma fonte de verdade.

---

### GAP 2: WebActivity e Outras Páginas Sem Guard Completo

**Problema**: WebActivity.tsx e outras páginas usam `AgentSelector` (que tem guard), mas:
- Os hooks internos como `useWebActivity` podem não ter guards consistentes
- Múltiplas páginas (SoftwareInventory, AgentTimeline, VulnerabilityFindings) dependem do padrão

**Solução**: Auditar e adicionar guards em todos os hooks de dados.

**Arquivos a verificar**:
- `src/hooks/useWebActivity.ts`
- `src/hooks/useSoftwareInventory.ts`
- `src/hooks/useAgentTimeline.ts`
- `src/hooks/useVulnFindings.ts`

---

### GAP 3: set_state nos Agentes Não Bloqueia SHUTDOWN

**Problema**: O comentário no seu feedback indica:
> "Se o agente está em SHUTDOWN, nenhuma transição é permitida. Sem isso, o agente entra em loop silencioso."

**Evidência no Código Atual** (Linux linha ~400-450):
- A função `set_state` valida transições mas NÃO tem hard block para SHUTDOWN

**Solução**: Adicionar check explícito no início de `set_state`:

```bash
set_state() {
    local new_state="$1"
    local reason="$2"

    # HARD BLOCK: SHUTDOWN é terminal
    if [[ "${AGENT_STATE[current]}" == "SHUTDOWN" ]]; then
        log "CRITICAL" "[FSM] Agent is in SHUTDOWN. No transitions allowed."
        exit 1
    fi
    
    # ... resto da função
}
```

---

### GAP 4: Auto-Update Rollback Não Explícito

**Problema**: O mecanismo `perform_self_update` pode falhar sem rollback:
- Download pode falhar
- Aplicação pode falhar
- Sem transição clara para DEGRADED

**Solução**: Garantir que `perform_self_update` (se existir) tem fallback:

```bash
perform_self_update() {
    local target_version="$1"
    
    log "INFO" "[UPDATE] Starting self-update to $target_version"
    
    # Backup antes de qualquer coisa
    cp "$0" "${PREVIOUS_SCRIPT_PATH}" || {
        log "ERROR" "[UPDATE] Failed to backup current script"
        set_state "DEGRADED" "update_backup_failed"
        return 1
    }
    
    # Download + aplicação (sua lógica existente)
    if ! download_and_apply_update "$target_version"; then
        log "ERROR" "[UPDATE] Failed to apply update"
        set_state "DEGRADED" "update_apply_failed"
        # Tentar rollback
        if [[ -f "${PREVIOUS_SCRIPT_PATH}" ]]; then
            cp "${PREVIOUS_SCRIPT_PATH}" "$0"
            log "INFO" "[UPDATE] Rolled back to previous version"
        fi
        return 1
    fi
    
    log "INFO" "[UPDATE] Successfully updated to $target_version"
    set_state "ENFORCING" "update_success"
}
```

---

### GAP 5: Falta RPC para Lista Canônica em Edge Function

**Problema**: Páginas como SystemHealth consultam `agents_safe` diretamente ao invés de usar snapshot canônico.

**Solução**: Criar nova Edge Function `agent-snapshots-list` ou RPC adicional.

---

## Ordem de Implementação

| Fase | Tarefa | Tempo | Prioridade |
|------|--------|-------|------------|
| 1 | Hard block SHUTDOWN nos agentes | 15min | 🔴 Crítico |
| 2 | RPC `get_agents_snapshots_list` | 20min | 🟠 Alto |
| 3 | Auditar hooks com guards faltantes | 30min | 🟡 Médio |
| 4 | Rollback explícito no auto-update | 20min | 🟡 Médio |

**Total estimado**: ~1h30min

---

## Detalhes de Implementação

### Fase 1: Hard Block SHUTDOWN nos Agentes

**Arquivos**:
- `public/agent-scripts/cybershield-agent-linux-v4.sh`
- `public/agent-scripts/cybershield-agent-macos-v4.sh`

**Localização**: Função `set_state()` (linha ~400-450 em ambos)

**Mudança**: Adicionar no início da função:
```bash
# HARD BLOCK: SHUTDOWN é estado terminal
if [[ "${AGENT_STATE[current]}" == "SHUTDOWN" ]]; then
    log "CRITICAL" "[FSM] Agent is in SHUTDOWN state. No transitions allowed. Exiting."
    exit 1
fi
```

---

### Fase 2: RPC para Lista de Snapshots

**Arquivo**: Nova migration SQL

```sql
-- RPC para obter lista de snapshots do tenant
CREATE OR REPLACE FUNCTION get_agents_snapshots_list()
RETURNS SETOF agent_snapshots
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT * FROM agent_snapshots;
$$;

GRANT EXECUTE ON FUNCTION get_agents_snapshots_list() TO authenticated;
```

**Hook atualizado** (`src/hooks/useAgentSnapshots.ts` - NOVO):

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import type { AgentSnapshot } from './useAgentSnapshot';

/**
 * Hook para lista canônica de snapshots (todos os agentes do tenant)
 * Usa RPC para garantir consistência com useAgentSnapshot individual
 */
export function useAgentSnapshots() {
  const { tenant, loading: tenantLoading } = useTenant();

  return useQuery({
    queryKey: ['agent-snapshots-list', tenant?.id],
    queryFn: async (): Promise<AgentSnapshot[]> => {
      const { data, error } = await supabase.rpc('get_agents_snapshots_list');
      
      if (error) throw new Error(error.message);
      return (data || []) as AgentSnapshot[];
    },
    enabled: !tenantLoading && !!tenant?.id,
    staleTime: 30_000,
    refetchInterval: 30_000, // Auto-refresh a cada 30s
  });
}
```

---

### Fase 3: Auditar Hooks de Dados

**Padrão a verificar em cada hook**:

```typescript
// ✅ CORRETO
const { tenant, loading: tenantLoading } = useTenant();

const query = useQuery({
  queryKey: ['data', tenant?.id],
  queryFn: async () => { /* ... */ },
  enabled: !tenantLoading && !!tenant?.id,  // GUARD OBRIGATÓRIO
});

// ❌ INCORRETO - causa race condition
const { tenant } = useTenant();

const query = useQuery({
  queryKey: ['data', tenant?.id],
  enabled: !!tenant?.id,  // Falta !loading
});
```

**Arquivos a auditar**:
- `src/hooks/useWebActivity.ts`
- `src/hooks/useSoftwareInventory.ts`
- `src/hooks/useAgentTimeline.ts`
- `src/hooks/useVulnFindings.ts`
- `src/hooks/useBlockedWebsites.ts`
- `src/hooks/useBlockedAttempts.ts`

---

### Fase 4: Rollback Explícito no Auto-Update

**Arquivos**:
- `public/agent-scripts/cybershield-agent-linux-v4.sh`
- `public/agent-scripts/cybershield-agent-macos-v4.sh`

**Localização**: Função que processa `force_update_version` do heartbeat

**Verificar se existe e adicionar fallback**:
```bash
handle_force_update() {
    local response="$1"
    local force_version
    force_version=$(echo "$response" | jq -r '.force_update_version // empty')
    
    if [[ -n "$force_version" && "$force_version" != "null" ]]; then
        log "INFO" "[UPDATE] Force update to $force_version requested"
        
        # Backup
        local backup_path="${CONFIG_DIR}/agent_backup_$(date +%s).sh"
        cp "$0" "$backup_path" 2>/dev/null || true
        
        # Tentar update
        if ! perform_self_update "$force_version"; then
            log "ERROR" "[UPDATE] Update failed, attempting rollback"
            if [[ -f "$backup_path" ]]; then
                cp "$backup_path" "$0"
                log "INFO" "[UPDATE] Rollback completed"
            fi
            set_state "DEGRADED" "force_update_failed"
        fi
    fi
}
```

---

## Validação Final

### Após Implementação das 4 Fases:

1. **SHUTDOWN Hard Block**:
   - Forçar agente para SHUTDOWN via heartbeat
   - Tentar qualquer transição → Deve falhar com exit 1

2. **Lista de Snapshots**:
   - Chamar RPC `get_agents_snapshots_list` → Deve retornar todos os agentes do tenant
   - Comparar com `agent-snapshot` individual → Dados devem ser idênticos

3. **Hooks Auditados**:
   - Deslogar → Logar → Navegar para WebActivity → Deve carregar normalmente (sem flash vazio)

4. **Rollback de Update**:
   - Simular falha de update → Agente deve fazer rollback e entrar em DEGRADED

---

## Resultado Esperado

Após implementação deste plano:

- ✅ **0 bugs de estado**: SHUTDOWN é terminal, sem loops
- ✅ **0 race conditions**: Todos os hooks têm guards
- ✅ **Fonte única de verdade**: Dashboard usa `useAgentSnapshots()`, detalhes usa `useAgentSnapshot()`
- ✅ **Rollback seguro**: Updates falhos não "brickam" agentes
- ✅ **FSM Enterprise v2.0 completa**: Paridade Windows/Linux/macOS

Este é o fechamento técnico definitivo para "zerar bugs" e ter um sistema vendável com confiança.
