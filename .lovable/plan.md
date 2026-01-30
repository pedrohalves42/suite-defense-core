

# Plano: Corrigir Detecção de Agentes Offline

## 🔍 Diagnóstico Completo

### Problema Principal
Os agentes estão sendo reportados como offline, mas o sistema **não está marcando nem alertando** porque há um **bug na verificação de horário de expediente**.

### Bug Identificado: Formato de `days` Inconsistente
- **Genial Cred** e **Pedro Alves** têm: `days: ["mon", "tue", "wed", "thu", "fri"]` (strings)
- **Outros tenants** têm: `days: [1, 2, 3, 4, 5]` (números)
- O código `business-hours.ts` linha 55 compara `currentDay` (número 0-6) com o array de `workDays`
- **Resultado**: strings nunca batem com números, então retorna `outside_business_hours` SEMPRE

### Evidência
Logs do `monitor-agent-health`:
```
[Monitor] Skipping offline check for Pc-Dani-Planalto - outside_business_hours
[Monitor] Skipping offline check for Pc-Yasmin-Tocantins - outside_business_hours
```

Dados do banco:
- Pc-Yasmin-Tocantins: **1257 minutos** (21h) sem heartbeat, ainda `status: active`
- Pc-Vidro-Planalto: **3788 minutos** (2.6 dias) sem heartbeat, ainda `status: active`

### Estado Atual dos Agentes Genial Cred
| Agente | Último Heartbeat | Status Atual | Deveria Ser |
|--------|------------------|--------------|-------------|
| PC-Amanda | < 1 min | active ✅ | active |
| Pc-Anna-Tibery | < 1 min | active ✅ | active |
| PC-Servidor-Planalto | < 1 min | active ✅ | active |
| pcteste1 | < 1 min | active ✅ | active |
| Pc-Julianna1-Planalto | < 1 min | active ✅ | active |
| MIT-SERVIDOR | < 1 min | active ✅ | active |
| Pc-Yasmin-Tocantins | 21h | active ❌ | **offline** |
| Pc-Dani-Planalto | 22h | active ❌ | **offline** |
| Pc-Davi-Tibery | 22h | active ❌ | **offline** |
| Pc-Adm-Tibery | 22h | active ❌ | **offline** |
| Pc-Vidro-Planalto | 2.6 dias | active ❌ | **offline** |
| Pc-Thais-Tocantins | 22h | active ❌ | **offline** |
| Pc-Meio-Planalto | 24h | active ❌ | **offline** |

---

## 🔧 Correções Necessárias

### Fase A: Corrigir Bug de Horário de Expediente (P0 - CRÍTICO)

**Arquivo**: `supabase/functions/_shared/business-hours.ts`

O código precisa aceitar AMBOS os formatos de `days`:
- Números: `[1, 2, 3, 4, 5]`
- Strings: `["mon", "tue", "wed", "thu", "fri"]`

**Mudança na função `isWithinBusinessHours`** (linhas 48-57):

```typescript
// Mapear weekday string para número (0-6)
const weekdayMap: Record<string, number> = {
  'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
  // CORREÇÃO: Adicionar versões lowercase para compatibilidade
  'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
  // CORREÇÃO: Adicionar nomes completos
  'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
};

const currentDay = weekdayMap[weekdayPart.value] ?? new Date().getDay();

// Verificar se é um dia de expediente
const workDays = config.days || [1, 2, 3, 4, 5];

// CORREÇÃO: Normalizar workDays para números
const normalizedWorkDays = workDays.map((day: number | string) => {
  if (typeof day === 'number') return day;
  // Converter string para número
  const normalized = weekdayMap[day.toLowerCase()];
  return normalized !== undefined ? normalized : -1;
}).filter((d: number) => d >= 0 && d <= 6);

if (!normalizedWorkDays.includes(currentDay)) {
  return false;
}
```

---

### Fase B: Corrigir Dados de Configuração no Banco (P0)

**Migration SQL**: Normalizar os valores de `days` para formato numérico:

```sql
-- Corrigir tenant_settings com days como strings
UPDATE tenant_settings
SET business_hours = jsonb_set(
  business_hours,
  '{days}',
  '[1, 2, 3, 4, 5]'::jsonb
)
WHERE business_hours->>'days' LIKE '%"mon"%'
   OR business_hours->>'days' LIKE '%"tue"%';
```

---

### Fase C: Atualizar Status para Offline Imediatamente (P1)

**Migration SQL**: Marcar agentes como offline baseado em heartbeat:

```sql
-- Marcar agentes sem heartbeat há mais de 30 minutos como offline
UPDATE agents
SET 
  status = 'offline',
  offline_detected_at = NOW(),
  offline_reason = 'heartbeat_timeout'
WHERE status = 'active'
  AND archived_at IS NULL
  AND last_heartbeat IS NOT NULL
  AND last_heartbeat < NOW() - INTERVAL '30 minutes';
```

---

### Fase D: Atualizar Monitor para Marcar Status Diretamente (P1)

**Arquivo**: `supabase/functions/monitor-agent-health/index.ts`

O código atual (linhas 76-78) diz explicitamente para NÃO mudar `status`:
```typescript
// CRITICAL FIX: NÃO alterar agents.status para 'offline'
```

Isso precisa ser reconsiderado. A abordagem correta é:
1. Manter `status = 'active'` para agentes que podem voltar (mantém na listagem)
2. Usar `offline_detected_at` + `offline_reason` para indicar estado offline
3. O frontend deve considerar `offline_detected_at IS NOT NULL` como "visualmente offline"

Entretanto, para compatibilidade com dashboards que filtram por `status`, podemos criar um novo status `offline` que ainda aparece nas listas.

**Alternativa**: Não mudar o código do monitor, mas garantir que:
1. O bug de horário seja corrigido (Fase A/B)
2. Os campos `offline_detected_at` sejam preenchidos
3. O frontend use esses campos para mostrar status visual

---

## 📋 Resumo de Entregáveis

| Prioridade | Tarefa | Tipo | Impacto |
|------------|--------|------|---------|
| **P0** | Corrigir normalização de `days` em `business-hours.ts` | Edge Function | Desbloqueia alertas |
| **P0** | Normalizar dados de `business_hours` no banco | SQL Migration | Corrige config existente |
| **P1** | Marcar agentes stale como offline no banco | SQL Migration | Atualiza status imediato |
| **P1** | Garantir que monitor preenche `offline_detected_at` | Já implementado | - |

---

## ✅ Validação

Após implementação:

1. **Logs do Monitor**:
   - NÃO deve mais mostrar `outside_business_hours` durante expediente (08:00-18:00)
   - Deve mostrar `Agent X marked as offline` para agentes sem heartbeat

2. **Banco de Dados**:
   ```sql
   SELECT agent_name, status, offline_detected_at, offline_reason 
   FROM agents 
   WHERE last_heartbeat < NOW() - INTERVAL '30 minutes';
   ```
   - Todos devem ter `offline_detected_at` preenchido

3. **Dashboard**:
   - Computadores sem heartbeat devem aparecer como "Offline"
   - Contagem deve refletir realidade (6 online, 7+ offline para Genial Cred)

---

## ⚠️ Causa Raiz do Serviço Parando

O serviço Windows está parando nos computadores afetados. As correções acima **detectam e alertam** sobre o problema, mas a **causa raiz** precisa ser investigada:

1. **Verificar Event Viewer** nos PCs afetados
2. **Ativar logging detalhado** no agente
3. **Configurar recovery do serviço** (já implementado no script v4)

Os computadores afetados provavelmente têm versão antiga do agente sem recovery automático. Uma reinstalação com o script v4 atualizado deve resolver.

