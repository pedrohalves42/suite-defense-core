
# Plano Unificado: Correção Total de Sincronização + FSM Enterprise + Edge Function Canônica

## ✅ STATUS: IMPLEMENTADO (2026-01-29)

Este plano foi implementado com sucesso. Todas as fases foram concluídas:
- ✅ FASE 1: Edge Function `agent-snapshot` + View + RPC
- ✅ FASE 2: Race conditions corrigidas em DiagnosticsCenter e SystemHealth
- ✅ FASE 3: Central de Ações corrigida (ActionCard, RejectInsightDialog)
- ✅ FASE 4: AgentMonitoring sincronizado com agent_state do banco
- ✅ FASE 5-6: Agentes Linux/macOS atualizados para v4.4.0 com FSM Enterprise v2.0

---

## Resumo Executivo

---

## Arquitetura Unificada

```text
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE FUNCTION CANÔNICA                        │
│                    agent-snapshot                                │
│                                                                  │
│  Input: agent_id (UUID)                                          │
│  Output: AgentSnapshot { identity, connectivity, health, diag }  │
│  Segurança: JWT + tenant isolation via RPC                       │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Chamada única
                              │
     ┌────────────────────────┼────────────────────────────┐
     │                        │                            │
     ▼                        ▼                            ▼
┌─────────────┐     ┌─────────────────┐         ┌─────────────────┐
│ Monitoramento│     │ Diagnósticos   │         │ Central Ações   │
│ AgentMonitoring│   │ DiagnosticsCenter│       │ ActionCard      │
└─────────────┘     └─────────────────┘         └─────────────────┘
```

---

## FASE 1: Edge Function Canônica (Fonte Única de Verdade)

### 1.1 Criar View Materializada no Banco

**SQL Migration**:
```sql
-- View para snapshot do agente (fonte única)
CREATE OR REPLACE VIEW agent_snapshots 
WITH (security_invoker = on) AS
SELECT
  a.id AS agent_id,
  a.tenant_id,
  a.hostname,
  a.os_type,
  a.agent_version AS version,
  a.last_heartbeat,
  (a.last_heartbeat > now() - interval '2 minutes') AS online,
  EXTRACT(epoch FROM (now() - a.last_heartbeat)) * 1000 AS latency_ms,
  a.agent_state,
  COALESCE(a.safe_mode_entered_at IS NOT NULL, false) AS safe_mode,
  a.safe_mode_reason,
  COALESCE(a.is_isolated, false) AS is_isolated,
  COALESCE(a.is_throttled, false) AS is_throttled,
  (SELECT COUNT(*) FROM diagnostic_issues di 
   WHERE di.agent_id = a.id AND di.resolved = false) AS active_issues,
  (SELECT COUNT(*) FROM ai_insights ai 
   WHERE ai.agent_id = a.id AND ai.status = 'open') AS unresolved_insights,
  now() AS snapshot_at
FROM agents a
WHERE a.tenant_id = get_active_tenant_id() OR is_current_super_admin();

-- RPC segura
CREATE OR REPLACE FUNCTION get_agent_snapshot(p_agent_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(s)
  FROM agent_snapshots s
  WHERE s.agent_id = p_agent_id;
$$;
```

### 1.2 Criar Edge Function `agent-snapshot`

**Arquivo**: `supabase/functions/agent-snapshot/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.203.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const correlationId = crypto.randomUUID()

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Apenas POST
    if (req.method !== 'POST') {
      return jsonError(405, 'Method not allowed', correlationId)
    }

    // Cliente com contexto do usuário
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Autenticação
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      return jsonError(401, 'Unauthorized', correlationId)
    }

    // Parse body
    let body: { agent_id?: string }
    try {
      body = await req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body', correlationId)
    }

    const { agent_id } = body
    if (!agent_id) {
      return jsonError(400, 'agent_id is required', correlationId)
    }

    // Chamada RPC
    const { data: snapshot, error: rpcError } = await supabase
      .rpc('get_agent_snapshot', { p_agent_id: agent_id })

    if (rpcError) {
      console.error('[agent-snapshot][RPC_ERROR]', { rpcError, agent_id, correlationId })
      return jsonError(500, 'Failed to fetch agent snapshot', correlationId)
    }

    if (!snapshot) {
      return jsonError(404, 'Agent not found', correlationId)
    }

    // Resposta padronizada
    return new Response(
      JSON.stringify({
        data: {
          ...snapshot,
          meta: { correlation_id: correlationId, snapshot_at: new Date().toISOString() }
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[agent-snapshot][UNHANDLED_ERROR]', { err, correlationId })
    return jsonError(500, 'Unexpected error', correlationId)
  }
})

function jsonError(status: number, message: string, correlationId: string) {
  return new Response(
    JSON.stringify({ error: message, correlation_id: correlationId }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
```

### 1.3 Hook React para Consumir o Snapshot

**Arquivo**: `src/hooks/useAgentSnapshot.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

export interface AgentSnapshot {
  agent_id: string;
  tenant_id: string;
  hostname: string | null;
  os_type: string | null;
  version: string | null;
  last_heartbeat: string | null;
  online: boolean;
  latency_ms: number | null;
  agent_state: string | null;
  safe_mode: boolean;
  safe_mode_reason: string | null;
  is_isolated: boolean;
  is_throttled: boolean;
  active_issues: number;
  unresolved_insights: number;
  meta: {
    correlation_id: string;
    snapshot_at: string;
  };
}

export function useAgentSnapshot(agentId?: string) {
  const { tenant, loading: tenantLoading } = useTenant();

  return useQuery({
    queryKey: ['agent-snapshot', agentId],
    queryFn: async (): Promise<AgentSnapshot> => {
      const { data, error } = await supabase.functions.invoke('agent-snapshot', {
        body: { agent_id: agentId }
      });
      
      if (error) throw new Error(error.message);
      return data.data as AgentSnapshot;
    },
    enabled: !tenantLoading && !!tenant?.id && !!agentId,
    staleTime: 30_000,
    retry: 1,
  });
}
```

---

## FASE 2: Correção de Race Conditions (Todas as Páginas)

### 2.1 DiagnosticsCenter.tsx

**Problema**: Linha 90 usa `useTenant()` sem extrair `loading`

**Correção**:
```typescript
// Linha 90 - ANTES:
const { tenant } = useTenant();

// DEPOIS:
const { tenant, loading: tenantLoading } = useTenant();

// Linha 114 - Adicionar guard:
enabled: !tenantLoading && !!tenant?.id,

// Linha 132 - Adicionar guard:
enabled: !tenantLoading && !!tenant?.id,
```

### 2.2 SystemHealth.tsx

**Problema**: Linha 27 usa `useTenant()` sem `loading`

**Correção**:
```typescript
// Linha 26-27 - ANTES:
const { tenant } = useTenant();

// DEPOIS:
const { tenant, loading: tenantLoading } = useTenant();

// Linhas 29, 68, 115, 149, 174 - Adicionar guard:
enabled: !tenantLoading && !!tenant?.id,
```

### 2.3 WebActivity.tsx (se existir)

Aplicar o mesmo padrão de loading guard.

---

## FASE 3: Central de Ações - Correções Críticas

### 3.1 ActionCard.tsx - Tratar agent_id null

**Problema**: Linha 189 falha silenciosamente quando `agent_id` é null

**Correção** (linhas 182-218):
```typescript
const handleSuggestedAction = async (actionType: string) => {
  // Navegação não requer agent_id específico
  if (actionType === 'navigate_agent' && item.agent_id) {
    navigate(`/admin/agent-health?agent=${item.agent_id}`);
    return;
  }

  if (!tenant?.id) {
    hToast.error('Tenant não identificado. Faça login novamente.');
    return;
  }
  
  // Para ações que NÃO requerem agent_id
  if (!item.agent_id) {
    hToast.info('Este insight é de nível sistema - marcando como revisado');
    await executeAction.mutateAsync({
      itemId: item.item_id,
      sourceType: item.source_type,
      action: 'acknowledge',
    });
    onExecuted?.();
    return;
  }

  // Resto do código original...
};
```

### 3.2 RejectInsightDialog.tsx - Validar tipo de item

**Problema**: Linha 76 falha quando `insightId` é formato `offline_UUID`

**Correção** (linha 53-54):
```typescript
const rejectMutation = useMutation({
  mutationFn: async () => {
    // Validar que é um insight real da IA
    if (insightId.startsWith('offline_') || insightId.startsWith('alert_')) {
      throw new Error('Alertas de sistema não podem ser rejeitados como insights da IA');
    }
    
    // Resto do código original...
  },
});
```

### 3.3 ActionCard.tsx - Ocultar botão Rejeitar para non-insights

**Correção** (próximo à linha 580-617):
```typescript
{/* Só mostrar Rejeitar para insights reais da IA */}
{item.source_type === 'ai_insight' && 
 !item.item_id.startsWith('offline_') && 
 !item.item_id.startsWith('alert_') && (
  <Button variant="outline" onClick={() => setRejectDialogOpen(true)}>
    Rejeitar
  </Button>
)}
```

---

## FASE 4: Sincronização de Estado - Monitoramento vs Detalhes

### 4.1 AgentMonitoring.tsx - Usar agent_state do banco

**Problema**: `getAgentCalculatedStatus` calcula localmente, mas detalhes usam `agent_state`

**Correção** (linha 43-49):
```typescript
const getAgentCalculatedStatus = (agent: Agent): 'online' | 'warning' | 'offline' | 'never_connected' => {
  // PRIORIZAR agent_state do banco para consistência
  if (agent.agent_state) {
    switch (agent.agent_state) {
      case 'healthy':
      case 'enforcing':
        return 'online';
      case 'degraded':
      case 'recovery':
        return 'warning';
      case 'error':
      case 'shutdown':
        return 'offline';
    }
  }
  
  // Fallback para cálculo por heartbeat
  if (!agent.last_heartbeat) return 'never_connected';
  const minutesSince = (Date.now() - new Date(agent.last_heartbeat).getTime()) / 1000 / 60;
  if (minutesSince < 2) return 'online';
  if (minutesSince < 5) return 'warning';
  return 'offline';
};
```

---

## FASE 5: Atualização dos Agentes Linux e macOS para v4.4.0

### 5.1 Agente Linux - Adicionar FSM Enterprise

**Arquivo**: `public/agent-scripts/cybershield-agent-linux-v4.sh`

**Alterações**:

1. **Adicionar SHUTDOWN aos estados** (linha 77):
```bash
declare -a VALID_STATES=("BOOTSTRAP" "SYNCING" "ENFORCING" "DEGRADED" "ERROR" "RECOVERY" "SHUTDOWN")

declare -A STATE_TRANSITIONS=(
    ["BOOTSTRAP"]="SYNCING ERROR"
    ["SYNCING"]="ENFORCING DEGRADED ERROR"
    ["ENFORCING"]="DEGRADED ERROR SYNCING"
    ["DEGRADED"]="RECOVERY ERROR ENFORCING SHUTDOWN"
    ["RECOVERY"]="ENFORCING DEGRADED ERROR SHUTDOWN"
    ["ERROR"]="RECOVERY SHUTDOWN"
    ["SHUTDOWN"]=""  # Terminal
)
```

2. **Adicionar FailurePolicy** (após linha 110):
```bash
# Failure Policy (FSM Enterprise v2.0)
declare -A FAILURE_POLICY=(
    [max_recovery_attempts]=5
    [recovery_window_seconds]=300
    [cooldown_seconds]=600
    [max_consecutive_failures]=10
    [on_exhaust]="DEGRADED"
)

declare -A FAILURE_COUNTERS
```

3. **Adicionar funções de observabilidade** (após add_evidence):
```bash
# Log com deduplicação
declare -A LOG_DEDUP_CACHE
LOG_DEDUP_TTL=30

write_log_dedup() {
    local level="$1"
    local message="$2"
    local cache_key="${level}|${message}"
    local now=$(date +%s)
    
    if [[ -n "${LOG_DEDUP_CACHE[$cache_key]:-}" ]]; then
        local last_log="${LOG_DEDUP_CACHE[$cache_key]}"
        local elapsed=$((now - last_log))
        if [[ $elapsed -lt $LOG_DEDUP_TTL ]]; then
            return  # Suprimir duplicado
        fi
    fi
    
    LOG_DEDUP_CACHE[$cache_key]=$now
    log "$level" "$message"
}

# Health snapshot único por ciclo
write_health_snapshot() {
    local correlation_id="$1"
    local dns_status="unknown"
    
    if [[ "$DNS_FILTER_ENABLED" == "true" ]]; then
        if systemctl is-active --quiet "$DNS_FILTER_SERVICE" 2>/dev/null; then
            dns_status="ok"
        else
            dns_status="failed"
        fi
    else
        dns_status="disabled"
    fi
    
    local snapshot="{\"state\":\"${AGENT_STATE[current]}\",\"components\":{\"dns_filter\":\"$dns_status\"},\"correlation_id\":\"$correlation_id\"}"
    add_evidence "health_snapshot" "$snapshot" "" "" "info"
}

# Incident summary ao entrar em estado crítico
write_incident_summary() {
    local root_cause="$1"
    local correlation_id="$2"
    local incident_id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)
    
    local recommended_action="contact_support"
    if [[ "$root_cause" == *"dns"* ]]; then
        recommended_action="reinstall_dns_service"
    elif [[ "$root_cause" == *"heartbeat"* ]]; then
        recommended_action="check_network_connectivity"
    fi
    
    local summary="{\"incident_id\":\"$incident_id\",\"root_cause\":\"$root_cause\",\"recommended_action\":\"$recommended_action\",\"agent_version\":\"$AGENT_VERSION\",\"correlation_id\":\"$correlation_id\"}"
    add_evidence "incident_summary" "$summary" "" "" "critical"
    
    log "ERROR" "[INCIDENT] Summary generated: $incident_id - $recommended_action"
}
```

4. **Atualizar set_state para gerar incident_summary**:
```bash
# Ao final de set_state, adicionar:
if [[ "$new_state" == "ERROR" || "$new_state" == "DEGRADED" ]]; then
    write_incident_summary "$reason" "$(date +%s)"
fi
```

5. **Atualizar versão**:
```bash
AGENT_VERSION="v4.4.0"
```

### 5.2 Agente macOS - Mesmas alterações

**Arquivo**: `public/agent-scripts/cybershield-agent-macos-v4.sh`

Aplicar exatamente as mesmas modificações (código muito similar ao Linux).

---

## FASE 6: Sincronização de Auto-Update

### 6.1 Verificar processamento de force_update nos agentes Linux/macOS

Garantir que ambos os scripts processam a resposta do heartbeat:

```bash
handle_heartbeat_response() {
    local response="$1"
    
    # Force update check
    local force_update_version=$(echo "$response" | jq -r '.force_update_version // empty')
    if [[ -n "$force_update_version" && "$force_update_version" != "null" ]]; then
        log "INFO" "[UPDATE] Force update to $force_update_version requested"
        perform_self_update "$force_update_version"
    fi
}
```

---

## Arquivos a Modificar

| Arquivo | Fase | Tipo | Descrição |
|---------|------|------|-----------|
| **Migrations SQL** | 1 | New | View `agent_snapshots` + RPC `get_agent_snapshot` |
| `supabase/functions/agent-snapshot/index.ts` | 1 | New | Edge Function canônica |
| `src/hooks/useAgentSnapshot.ts` | 1 | New | Hook para consumir snapshot |
| `src/pages/admin/DiagnosticsCenter.tsx` | 2 | Fix | Adicionar `!tenantLoading` guard |
| `src/pages/admin/SystemHealth.tsx` | 2 | Fix | Adicionar `!tenantLoading` guard |
| `src/components/action-center/ActionCard.tsx` | 3 | Fix | Tratar `agent_id` null, ocultar Rejeitar |
| `src/components/action-center/RejectInsightDialog.tsx` | 3 | Fix | Validar tipo de item |
| `src/pages/AgentMonitoring.tsx` | 4 | Fix | Priorizar `agent_state` do banco |
| `public/agent-scripts/cybershield-agent-linux-v4.sh` | 5 | Upgrade | FSM v2.0, invariantes, hard stops |
| `public/agent-scripts/cybershield-agent-macos-v4.sh` | 5 | Upgrade | FSM v2.0, invariantes, hard stops |

---

## Ordem de Execução

1. **Fase 1** (45min): Criar SQL + Edge Function + Hook
2. **Fase 2** (30min): Corrigir race conditions em páginas admin
3. **Fase 3** (30min): Corrigir Central de Ações
4. **Fase 4** (15min): Sincronizar cálculo de estado
5. **Fase 5** (1h30): Atualizar agentes Linux/macOS para v4.4.0
6. **Fase 6** (15min): Verificar auto-update

**Total estimado**: ~4h

---

## Validação Pós-Implementação

1. **Monitoramento**: Clicar em agente "crítico" deve mostrar mesmo status nos detalhes
2. **Diagnósticos**: Deve mostrar lista de computadores imediatamente (sem esperar)
3. **Central de Ações**:
   - "Ver sugestões" funciona para insights com e sem `agent_id`
   - "Rejeitar" só aparece para insights reais da IA
4. **Navegador Web**: Deve permitir selecionar computador
5. **Saúde do Sistema**: Mostra contagem correta de online/offline
6. **Agentes Linux/macOS**: Devem reportar v4.4.0 no próximo heartbeat

---

## Seção Técnica: Contrato da Edge Function

### Request
```json
POST /functions/v1/agent-snapshot
Authorization: Bearer USER_JWT
Content-Type: application/json

{
  "agent_id": "uuid"
}
```

### Response (Sucesso)
```json
{
  "data": {
    "agent_id": "uuid",
    "tenant_id": "uuid",
    "hostname": "PC-01",
    "os_type": "windows",
    "version": "v4.4.0",
    "last_heartbeat": "2026-01-29T12:47:00Z",
    "online": true,
    "latency_ms": 1234,
    "agent_state": "healthy",
    "safe_mode": false,
    "is_isolated": false,
    "is_throttled": false,
    "active_issues": 0,
    "unresolved_insights": 1,
    "meta": {
      "correlation_id": "abc123",
      "snapshot_at": "2026-01-29T12:48:00Z"
    }
  }
}
```

### Response (Erro)
```json
{
  "error": "Agent not found",
  "correlation_id": "abc123"
}
```

### Garantias
- Tenant isolado via RLS (nunca retorna dados de outro tenant)
- Todas as UIs veem o mesmo estado
- Correlation ID para debug
- Erros claros, sem falha silenciosa
