
## Plano: Resolver Problemas de Computadores Offline e Saúde do Pipeline

### 📊 Diagnóstico Completo

**Problema Central: Agentes Windows parando de enviar heartbeat após algumas horas**

Baseado na análise dos dados:

| Agente | Último Heartbeat | Status Real |
|--------|------------------|-------------|
| PC-Amanda, Pc-Julianna1, pcteste1, PC-Servidor | < 1 min | ✅ Online |
| Pc-Yasmin-Tocantins | ~21 horas | ❌ Serviço parou |
| Pc-Dani, Pc-Davi, Pc-Adm-Tibery | ~22 horas | ❌ Serviço parou |
| Pc-Vidro-Planalto | ~2.6 dias | ❌ Serviço parou |

**O Dashboard mostra "7 computadores offline" corretamente** - isso NÃO é um bug do frontend. Os agentes realmente pararam de enviar heartbeat porque o serviço Windows (CyberShield Agent Service) parou de funcionar nesses computadores.

**Causas Prováveis do Serviço Parar:**
1. **Crash do serviço Windows** - O processo pode estar morrendo sem ser reiniciado
2. **Falta de recovery automático** - O serviço não está configurado para reiniciar após falha
3. **Problemas de rede/firewall** - Bloqueio intermitente das requisições HTTPS
4. **Timeout/Hang do processo** - O agente pode estar travando em alguma operação

---

### 🔧 Correções Necessárias

#### Fase A: Frontend - Corrigir Heartbeat Pipeline Health (P0)

O `usePipelineHealth.ts` usa `agents_safe` view que pode falhar sem JWT claims.

**Arquivo**: `src/hooks/usePipelineHealth.ts`

**Correção**: Migrar de `agents_safe` para query direta em `agents` com filtro explícito de tenant_id:

```typescript
// ANTES (linha 74-81):
supabase
  .from('agents_safe')
  .select('last_heartbeat')
  .eq('tenant_id', tenantId)
  ...

// DEPOIS:
supabase
  .from('agents')  // Query direta
  .select('last_heartbeat')
  .eq('tenant_id', tenantId)
  .is('archived_at', null)
  .order('last_heartbeat', { ascending: false, nullsFirst: false })
  .limit(1)
  .maybeSingle(),
```

**Nota**: A tabela `agents` é acessível via RLS existente para usuários autenticados com tenant.

---

#### Fase B: Criar Job de "Verificação de Serviço" (P1)

Para detectar e resolver automaticamente agentes que param de funcionar, criar um sistema de verificação.

**1. Nova RPC para detectar agentes que pararam:**

```sql
CREATE OR REPLACE FUNCTION get_stale_agents(
  p_tenant_id uuid,
  p_threshold_minutes int DEFAULT 30
)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  last_heartbeat timestamptz,
  minutes_since_heartbeat numeric,
  agent_version text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    id,
    agent_name,
    last_heartbeat,
    EXTRACT(EPOCH FROM (NOW() - last_heartbeat))/60 as minutes_since_heartbeat,
    agent_version
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND archived_at IS NULL
    AND status = 'active'
    AND last_heartbeat < NOW() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY last_heartbeat ASC;
$$;
```

**2. Novo job type: `service_health_check`**

Os agentes já suportam esse tipo de job (vi no banco). O problema é que os agentes offline não conseguem receber o job porque não estão fazendo polling.

---

#### Fase C: Ajustar Instalação do Agente Windows (P2)

**Problema**: O serviço Windows não está configurado para reiniciar automaticamente após crash.

**Solução**: Atualizar o script de instalação do agente para configurar:

```powershell
# Configurar recovery do serviço
sc.exe failure "CyberShield Agent" reset= 86400 actions= restart/5000/restart/10000/restart/30000

# Isso configura:
# - 1ª falha: reinicia em 5 segundos
# - 2ª falha: reinicia em 10 segundos  
# - 3ª falha: reinicia em 30 segundos
# - Reset do contador após 24h
```

**Onde**: No script `setup-agent-script` ou no instalador PowerShell.

---

#### Fase D: Atualizar Status do Agente no Banco (P1)

Atualmente o status fica `active` mesmo quando o agente para de enviar heartbeat. Criar um cron job para atualizar automaticamente:

```sql
-- Atualizar status para 'offline' quando heartbeat > 30 min
UPDATE agents
SET 
  status = 'offline',
  status_updated_at = NOW()
WHERE status = 'active'
  AND last_heartbeat < NOW() - INTERVAL '30 minutes'
  AND archived_at IS NULL;
```

Isso pode ser executado pelo `cron-sentinel` ou `monitor-agent-health` Edge Function.

---

### 📋 Resumo de Entregáveis

| Prioridade | Tarefa | Tipo |
|------------|--------|------|
| P0 | Migrar `usePipelineHealth.ts` de `agents_safe` para `agents` | Frontend |
| P1 | Criar RPC `get_stale_agents` para detectar agentes offline | SQL |
| P1 | Atualizar `monitor-agent-health` para marcar agentes como offline | Edge Function |
| P2 | Configurar recovery automático do serviço Windows | Script instalação |

---

### ✅ Validação

1. **Pipeline Health Card**:
   - Após correção, "Heartbeats" deve mostrar status correto (Fresh se há agentes online)
   - Não deve mostrar "Indeterminado" se há heartbeats recentes

2. **Lista de Computadores**:
   - Agentes sem heartbeat > 30 min devem aparecer como "Offline" (já funciona)
   - O número "7 computadores offline" está correto

3. **Serviço Windows**:
   - Após atualização do script, serviços devem reiniciar automaticamente após crash

---

### 🎯 Ação Imediata Recomendada

Para resolver os 7 computadores offline agora, você precisa:

1. **Acessar cada computador afetado remotamente**
2. **Verificar status do serviço**: `Get-Service "CyberShield Agent"`
3. **Se parado, reiniciar**: `Start-Service "CyberShield Agent"`
4. **Verificar logs**: Consultar Event Viewer > Windows Logs > Application

Os computadores que estão online (PC-Amanda, Pc-Julianna1, etc.) estão funcionando normalmente e enviando heartbeats a cada ~60 segundos.
