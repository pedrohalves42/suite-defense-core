
## Objetivo
Eliminar o alerta **“Erro ao carregar estado / Não foi possível determinar o estado deste computador”** no drawer do computador (aba **Geral**) em **/admin/agent-health**.

---

## Diagnóstico do que está acontecendo (com base no código atual)
### Sintoma na UI
O componente `AgentStateExplainer` mostra erro quando:
- `useAgentCausality()` retorna `null` (sem erro “fatal”), ou
- o hook falha (erro de query).

Hoje ele cai no erro porque o hook retorna `null`/vazio para o agente.

### Causa raiz mais provável
O hook `useAgentCausality` foi alterado para buscar o agente direto na tabela **`agents`**:

- Em ambientes com RLS mais restritivo, a tabela `agents` pode **não ser visível** para usuários comuns (ou até para alguns admins), justamente porque ela pode conter campos sensíveis.
- Quando a query não tem permissão/visibilidade de linha, com `.maybeSingle()` é comum a resposta vir como “sem dados” (sem necessariamente estourar erro), e o hook retorna `null`.  
- O projeto já tem a view **`agents_safe`** (com `security_invoker=on`, fallback por `user_roles` e suporte a `super_admin`) exatamente para esse caso.

Resultado: a aba “Geral” abre, mas o estado não consegue ser determinado porque o hook não encontra o agente.

---

## Mudanças propostas (frontend)
### 1) Voltar a usar a view `agents_safe` no `useAgentCausality`
**Arquivo:** `src/hooks/useAgentCausality.ts`

- Trocar:
  - `from('agents')`  
  por:
  - `from('agents_safe')`

- Selecionar apenas os campos necessários (ex.: `tenant_id`, `last_heartbeat`, `agent_state`, `agent_state_reason`, `is_isolated`, `is_throttled`, `safe_mode_reason`, `safe_mode_entered_at`, `isolated_at`, `isolation_reason`, `throttled_at`, `throttle_reason`, `force_update_*`, `offline_reason`, etc.).  
  Isso mantém o hook compatível com a lógica atual (`deriveAgentState` + mensagens/razões).

**Por que isso resolve:** `agents_safe` foi desenhada para ser consultável pela UI com as proteções e fallbacks corretos, evitando retornos vazios por restrição da tabela base.

---

### 2) Tornar o hook resistente a mismatch de tenant (opcional, mas recomendado)
Mesmo no `/admin/agent-health`, o drawer já recebe `tenantId` via props.

**Ajuste proposto:**
- Mudar a assinatura do hook para aceitar também `tenantId` (opcional):
  - `useAgentCausality(agentId: string | null, tenantId?: string | null)`
- Quando `tenantId` vier preenchido, aplicar `.eq('tenant_id', tenantId)` além do `.eq('id', agentId)`.

**Por que isso ajuda:** evita casos em que o estado do drawer falha por “contexto de empresa” divergente (especialmente em cenários multi-tenant/super-admin).

---

### 3) Melhorar a mensagem quando não houver dados (sem quebrar a UX)
**Arquivo:** `src/components/agent/AgentStateExplainer.tsx`

Hoje ele mostra a mesma mensagem genérica para `error` e para `!causality`.

**Melhoria:**
- Diferenciar:
  - `error` (falha técnica)
  - `causality === null` (agente não encontrado/sem visibilidade)
- Exibir uma descrição mais acionável quando `causality` vier `null`, por exemplo:
  - “Este computador não está visível no contexto atual. Verifique se você está na empresa correta e atualize a página.”

Opcional:
- Expor `refetch` do `useAgentCausality` e colocar um botão “Tentar novamente” também nesse estado.

---

## Validação (passo a passo)
1. Abrir **/admin/agent-health**
2. Clicar no computador **pcteste1** para abrir o drawer
3. Confirmar na aba **Geral**:
   - O erro “Erro ao carregar estado” não aparece
   - O estado e explicação renderizam normalmente
4. Repetir com:
   - 1 computador saudável
   - 1 offline
   - 1 em estado crítico/alertas
5. Confirmar que:
   - A aba “Diagnóstico” não volta a disparar warning de “state ausente”
   - Não há regressão de permissões (usuários não-super-admin conseguem ver o estado via `agents_safe`)

---

## Observações técnicas (para manter o padrão arquitetural do projeto)
- O projeto tem a view canônica `v_agent_state`, mas hoje o drawer depende do `useAgentCausality` (que também usa razões específicas como `safe_mode_reason`, `isolation_reason`).  
- Esta correção é a opção mais curta e segura porque reaproveita a view `agents_safe` (já existente e “feita para UI”), resolvendo o bug sem abrir acesso direto à tabela sensível `agents`.

---

## Escopo
Inclui apenas mudanças de frontend (sem mudanças no backend), focadas em:
- `useAgentCausality`
- `AgentStateExplainer`
- (opcional) passar `tenantId` explícito para o hook a partir do drawer
