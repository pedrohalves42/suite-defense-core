
# Correção de Erros no Painel Administrativo

## Problemas Identificados

### Erro 1: "Computador não visível" no drawer (MIT-SERVIDOR)
O drawer de detalhes do agente recebe `tenantId` como prop mas **não repassa** para o hook `useAgentCausality()`. Quando há delay na sincronização do JWT, a view `agents_safe` retorna vazio porque:
- `get_active_tenant_id()` retorna NULL (JWT ainda não atualizado)
- `is_current_super_admin()` falha sem contexto de auth
- O hook usa `activeTenant?.id` como fallback, mas isso também pode estar loading

### Erro 2: "[DLQ:AGENT_OFFLINE] Auto-cleanup..." na Central de Tarefas
Jobs agendados para agentes offline são automaticamente enviados para DLQ após 2 horas de timeout. Isso é comportamento esperado do sistema, não um erro real - mas está sendo exibido como uma tarefa pendente.

### Erro 3: 388 Alertas Críticos
Grande volume de alertas AI (`ai_insight_alert`) e de sistema (`high_cpu`, `high_disk`, etc.) não reconhecidos. A maioria é de análise de IA gerando insights em lote.

### Erro 4: 3 Computadores Offline
Agentes que não enviam heartbeat há mais de 10 minutos. Situação real que requer atenção.

---

## Solução

### Fix 1: Passar tenantId explícito para useAgentCausality

**Arquivo:** `src/components/agent/AgentDetailsDrawer.tsx`

**Mudança:**
```typescript
// ANTES (linha 97):
const { data: causality, isLoading, isError, refetch } = useAgentCausality(agentId);

// DEPOIS:
const { data: causality, isLoading, isError, refetch } = useAgentCausality(agentId, tenantId);
```

Isso garante que mesmo com delay no JWT, o hook usa o tenantId explícito passado pelo componente pai.

### Fix 2: Aplicar mesmo padrão no AgentStateExplainer

**Arquivo:** `src/components/agent/AgentStateExplainer.tsx`

O componente precisa aceitar `tenantId` como prop opcional e repassar para `useAgentCausality`:

```typescript
interface AgentStateExplainerProps {
  agentId: string | null;
  tenantId?: string | null;  // NOVO
  compact?: boolean;
}

export function AgentStateExplainer({ agentId, tenantId, compact = false }) {
  const { data: causality, isLoading, error } = useAgentCausality(agentId, tenantId);
  // ...
}
```

### Fix 3: Propagar tenantId nas chamadas do AgentStateExplainer

Atualizar todos os usos de `AgentStateExplainer` para passar `tenantId` quando disponível:

- `AgentDetailsDrawer.tsx` → já tem tenantId
- `DiagnosticsCenter.tsx` → tem acesso via selectedAgent
- `InsightInvestigationDrawer.tsx` → tem acesso via useTenant

### Fix 4: (Opcional) Melhorar feedback para DLQ jobs

Considerar filtrar ou diferenciar visualmente jobs DLQ por timeout de agente offline vs. falhas reais na Central de Tarefas.

---

## Arquivos a Modificar

1. `src/components/agent/AgentDetailsDrawer.tsx` - Passar tenantId para useAgentCausality
2. `src/components/agent/AgentStateExplainer.tsx` - Aceitar e usar tenantId prop
3. `src/pages/admin/DiagnosticsCenter.tsx` - Passar tenantId para AgentStateExplainer
4. `src/components/action-center/InsightInvestigationDrawer.tsx` - Passar tenantId

---

## Resultado Esperado

Após as correções:
- Drawer de MIT-SERVIDOR carregará dados corretamente
- Não haverá mais erro "Computador não visível" por race condition de JWT
- Componentes terão comportamento determinístico usando tenantId explícito
- Os alertas críticos e DLQ continuarão visíveis (são dados reais do sistema)

---

## Detalhes Técnicos

O padrão ADR-029 (tenant sync guard) recomenda:
1. Sempre usar `enabled: !loading && !!tenantId` em queries
2. Preferir tenantId explícito sobre contexto global quando disponível
3. O hook `useAgentCausality` já implementa isso, mas precisa receber o parâmetro

A view `agents_safe` tem 3 caminhos de acesso:
```sql
WHERE (
  tenant_id = get_active_tenant_id()           -- Via JWT claim
  OR (get_active_tenant_id() IS NULL AND EXISTS(SELECT 1 FROM user_roles...))  -- Fallback
  OR is_current_super_admin()                  -- Super admin
)
```

Quando o JWT não está sincronizado, todos os 3 falham. Passando tenantId explícito para a query com `.eq('tenant_id', effectiveTenantId)`, garantimos que funcione mesmo sem JWT.
