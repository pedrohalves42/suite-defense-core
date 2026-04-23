
### 1. Otimização de Cache no Frontend (React Query)
*   **Ajuste Global de StaleTime:** Alterar a configuração padrão no `src/main.tsx` de 10 minutos para 15 minutos, mas focar especificamente nos hooks de métricas (`useUnifiedMetrics`, `useAgentSnapshots`) para que não recarreguem a menos que seja explicitamente solicitado.
*   **Remoção de Invalidação por Heartbeat:** No arquivo `src/pages/admin/AgentHealthMonitor/useAgentHealthMonitor.ts`, desativar a linha que chama `queryClient.invalidateQueries` dentro do listener de tempo real. Substituir pela atualização apenas do estado local do componente para o indicador visual de "online".

### 2. Eficiência em Edge Functions
*   **Desativação do Gatilho de Compliance Automático:** Modificar o `src/pages/admin/ExecutiveDashboard/useExecutiveDashboard.ts` para parar de chamar `security:calculate-compliance` via `supabase.functions.invoke` toda vez que a página é carregada.
*   **Migração para Background Jobs:** Criar uma tarefa agendada (Cron) no Supabase para rodar o cálculo de compliance uma vez por hora para todos os tenants, eliminando o custo de execução sob demanda disparado pelo frontend.
*   **Redução de Polling de Build:** No hook `useAgentBuild.ts`, aumentar o intervalo de verificação de status de 10 segundos para 30 ou 60 segundos.

### 3. Redução de Volume de Dados (I/O)
*   **Seleção de Colunas Específicas:** Revisar consultas que utilizam `.select('*')` (como em `useTodayRiskDelta.ts`) para selecionar apenas as colunas estritamente necessárias, reduzindo o tráfego de saída (Egress) do banco de dados.
*   **Debounce em Pesquisas:** Garantir que filtros de busca em listas de agentes e logs tenham um atraso (debounce) de pelo menos 500ms antes de disparar novas consultas ao banco.

### 4. Relatório de Impacto Esperado
*   **Invocação de Edge Functions:** Redução estimada de 70-80% ao remover gatilhos automáticos de dashboards.
*   **Requisições ao Banco de Dados (API):** Redução de 50% através do ajuste de políticas de cache e tempo de vida dos dados no frontend.
*   **Custo Mensal:** Meta de redução de $95 para a faixa de $15-$25 (dentro do free tier ou créditos base).
