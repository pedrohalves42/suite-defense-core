
### Plano de Otimização de Performance e Eficiência de Recursos

Este plano detalha as etapas para transformar o sistema em uma aplicação de alta performance, focando em redução de carga computacional e economia de custos operacionais.

#### 1. Diagnóstico e Profiling (Fase de Identificação)
*   **Análise de Re-renders**: Utilizar o *React Profiler* para identificar componentes na `src/components/dashboard` e `src/pages/AgentMonitoring` que renderizam desnecessariamente em cada atualização de heartbeat.
*   **Detecção de Memory Leaks**: Auditar `src/hooks/useRealtimeHooks.ts` e subscrições do Supabase para garantir o *cleanup* rigoroso de canais quando os componentes são desmontados.
*   **Monitoramento de Bundle Size**: Analisar o impacto de bibliotecas pesadas e implementar *Lazy Loading* (React.lazy) em rotas administrativas e modais complexos (ex: `VendorRiskRegistry`).

#### 2. Otimização de Algoritmos e Dados (Frontend)
*   **Memoização de Transformações**: Aplicar `useMemo` em `useAgentMonitoring.ts` e `useUnifiedMetrics.ts` para evitar que cálculos de tendências e filtros de arrays (como `historicalScans.filter`) sejam reexecutados sem mudanças nos dados de origem.
*   **Substituição de Loops O(n²)**: Refatorar verificações de cruzamento de dados (ex: associar agentes a alertas) utilizando `Map` ou `Set` para garantir acesso em tempo constante O(1).
*   **Virtualização de Listas**: Implementar `react-window` ou `tanstack-virtual` em `InstallationLogsExplorer.tsx` e tabelas de agentes, garantindo que apenas as linhas visíveis sejam renderizadas no DOM.

#### 3. Refinamento da Camada de Dados (React Query & API)
*   **Seletores de Query**: Implementar a propriedade `select` nos hooks de `useQuery` para que componentes secundários só re-renderizem se o fragmento específico de dados que consomem for alterado.
*   **Debouncing de Persistência**: Implementar *debouncing* em inputs de busca e filtros globais para evitar disparos excessivos de requisições ao banco de dados durante a digitação.
*   **Otimização de Projeções SQL**: Revisar hooks que usam `.select('*')` e substituir por campos específicos, reduzindo o payload JSON e o consumo de banda/CPU de parsing.

#### 4. Estabilização e Validação
*   **Benchmarking de Carga**: Testar o dashboard com simuladores de +1000 agentes para garantir que a interface permanece fluida.
*   **Métricas Core Web Vitals**: Monitorar LCP (Largest Contentful Paint) e INP (Interaction to Next Paint) após as otimizações para validar a melhoria na percepção do usuário.
