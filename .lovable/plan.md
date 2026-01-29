
## Objetivo (o que vai mudar)
Fazer todas as telas que ainda mostram “Nenhum computador encontrado / Computadores 0” passarem a listar os 3 computadores do tenant corretamente, independentemente do JWT estar (ou não) com o claim `active_tenant_id`.

Pelos prints, **algumas telas já enxergam os 3 agentes** (ex.: lista de computadores com “Todos 3”), mas **as telas que dependem do seletor de computador** (Atividade Web / Programas Instalados) continuam vazias, e o **Tempo Real (/admin/monitoring-advanced)** continua mostrando “Computadores 0”.

---

## Diagnóstico final (por que “continua tudo do mesmo jeito”)
### 1) “Atividade Web” e “Programas Instalados” falham por causa do `AgentSelector`
Essas páginas renderizam o `<AgentSelector />`, e o `AgentSelector` **ainda consulta `agents_safe` diretamente**:
- `src/components/AgentSelector.tsx` faz `supabase.from('agents_safe')...`
Quando essa query retorna vazio (por qualquer motivo de sincronização/visibilidade), o componente cai no estado:
> “Nenhum computador encontrado. Instale o software…”

Ou seja: mesmo que outras páginas estejam usando RPC, **essas telas continuam presas no caminho “view”**.

### 2) “Monitoramento em Tempo Real” (/admin/monitoring-advanced) falha por depender de um RPC que lê de `active_agents`
A tela `AgentMonitoringAdvanced` chama a função de backend `get-agent-dashboard-data`, que por sua vez chama o RPC `get_latest_agent_metrics(p_tenant_id)`.

Hoje, o `get_latest_agent_metrics` e `get_agent_health_metrics` estão implementados como:
- `FROM active_agents a WHERE a.tenant_id = p_tenant_id`

E o `active_agents` (view) no banco está definido como:
- `WHERE archived_at IS NULL AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())`

Quando a chamada vem do backend “service role” (ou sem claim), `get_active_tenant_id()` vira `NULL` e `is_current_super_admin()` não ajuda, então **`active_agents` pode ficar vazio**, fazendo os RPCs retornarem 0 e o dashboard mostrar “Computadores 0”.

Conclusão: precisamos eliminar a dependência desses RPCs em `active_agents` (ou tornar `active_agents` robusto para chamadas server-side).

---

## Escopo da correção (P0: resolver o que aparece nos prints)
1) Migrar `AgentSelector` para usar a RPC `get_agents_list(p_tenant_id)` (mesmo padrão já usado no Dashboard/AgentMonitoring).
2) Ajustar os RPCs `get_latest_agent_metrics` e `get_agent_health_metrics` para **consultarem a tabela `agents` diretamente** (com filtro por `p_tenant_id`), em vez de depender de `active_agents`.
3) Garantir que `get-agent-dashboard-data` continue funcionando sem depender de claim JWT (ele já valida tenant, só precisa de RPC confiável).

---

## Implementação (passo a passo)

### Fase A — Frontend (P0): corrigir “Nenhum computador encontrado” nas telas com seletor
#### A1) Atualizar `src/components/AgentSelector.tsx`
- Trocar `supabase.from('agents_safe')...eq('tenant_id', activeTenant.id)` por:
  - `supabase.rpc('get_agents_list', { p_tenant_id: activeTenant.id, p_include_archived: false })`
- Mapear o retorno `jsonb` para o formato esperado do seletor (id, agent_name, status, os_type, flags, heartbeat…).
- Manter o `enabled: !loading && !!activeTenant?.id` (já existe).
- Resultado esperado: o dropdown passa a listar `MIT-SERVIDOR`, `pcteste1`, `PCteste2` em “Atividade Web” e “Programas Instalados”.

#### A2) Remover/evitar queries auxiliares que ainda usam `agents_safe` nas páginas afetadas
- `src/pages/admin/SoftwareInventory.tsx` tem uma query “agents-list-for-jobs” usando `agents_safe`.
  - Trocar para usar `get_agents_list` também, ou melhor: reutilizar a lista do `AgentSelector` (se decidirmos centralizar via um hook comum).
- Resultado esperado: “Atualizar Lista” consegue resolver `agent_name` sem depender de `agents_safe`.

Opcional (P0 UX, recomendado):
- Ajustar a mensagem “Nenhum computador encontrado” para distinguir:
  - “Ainda sincronizando empresa…” (quando `loading`/`tenantLoading`), vs
  - “Nenhum computador cadastrado” (quando a RPC retorna zero mesmo).

---

### Fase B — Banco (P0): corrigir “Computadores 0” no /admin/monitoring-advanced
#### B1) Atualizar `public.get_latest_agent_metrics(p_tenant_id)`
- Mudar `FROM active_agents a` para `FROM agents a`
- Adicionar filtros explícitos:
  - `a.tenant_id = p_tenant_id`
  - `a.archived_at IS NULL`
  - (opcional) `a.status = 'active'` se essa for a semântica correta
- Manter join com `agent_system_metrics_partitioned` como está.

#### B2) Atualizar `public.get_agent_health_metrics(p_tenant_id)`
- Mudar `FROM active_agents a` para `FROM agents a`
- Adicionar filtros explícitos iguais:
  - `a.tenant_id = p_tenant_id`
  - `a.archived_at IS NULL`
  - (opcional) `a.status = 'active'`

Isso garante que:
- chamadas do frontend (usuário logado),
- e chamadas do backend (service role),
tenham o mesmo resultado: lista correta.

---

### Fase C — Validação (P0): prova end-to-end (sem “achismo”)
Após implementar:

1) **Atividade Web**
- Abrir `/admin/web-activity`
- Confirmar que o dropdown “Selecionar Computador” lista 3 computadores.
- Selecionar um e confirmar que a página sai do estado vazio.

2) **Programas Instalados**
- Abrir `/admin/software-inventory`
- Confirmar que o dropdown lista 3 computadores.
- Selecionar um e clicar “Atualizar Lista” (se aplicável) para confirmar que a criação de job acha o `agent_name`.

3) **Tempo Real**
- Abrir `/admin/monitoring-advanced`
- Confirmar que “Computadores” > 0 e que os cards não ficam N/A por ausência total de agentes.
- Verificar se continua mostrando alertas pendentes coerentes.

4) Verificação técnica rápida (opcional)
- Checar no console/network se as páginas pararam de chamar `agents_safe` e passaram a chamar `rpc/get_agents_list`.
- Checar se a chamada `get-agent-dashboard-data` retorna `summary.total_agents > 0`.

---

## Riscos e cuidados
- `get_agents_list` atualmente filtra `status = 'active'`. Se existirem agentes relevantes com status diferente, precisamos alinhar a semântica:
  - ou relaxar o filtro na RPC,
  - ou manter “active-only” e ajustar UI para não esperar outros status.
- Os RPCs `get_latest_agent_metrics`/`get_agent_health_metrics` ao lerem direto de `agents` precisam manter exatamente a mesma lista esperada (ex.: excluir arquivados).
- Evitar mexer em arquivos auto-gerados do cliente/tipos; qualquer ajuste deve ser só em componentes/hooks e migrations do banco.

---

## Entregáveis (o que vai ser alterado)
- Frontend:
  - `src/components/AgentSelector.tsx` (P0)
  - `src/pages/admin/SoftwareInventory.tsx` (P0, se necessário para “agents-list-for-jobs”)
- Banco (migration):
  - `CREATE OR REPLACE FUNCTION public.get_latest_agent_metrics(p_tenant_id uuid)` (P0)
  - `CREATE OR REPLACE FUNCTION public.get_agent_health_metrics(p_tenant_id uuid)` (P0)

---

## Resultado esperado
- “Atividade Web” e “Programas Instalados” deixam de exibir “Nenhum computador encontrado” e passam a permitir seleção de computador.
- “Monitoramento em Tempo Real” deixa de mostrar “Computadores 0” quando existe agente ativo no tenant.
- O sistema fica resiliente: mesmo se o claim `active_tenant_id` estiver faltando/atrasado, as telas continuam funcionando porque as consultas principais passam a usar **tenant_id explícito** via RPC e os RPCs deixam de depender de uma view que exige claim.
