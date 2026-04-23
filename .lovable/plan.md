
### Plano de Auditoria Técnica: Qualidade, Lógica e Performance Extrema

Este plano detalha a estratégia para transformar o sistema em uma aplicação de alta fidelidade técnica, eliminando bugs de lógica e otimizando o consumo de recursos (CPU/RAM) conforme as instruções do usuário.

#### 1. Auditoria de Lógica e Correção de Bugs (Fase de Estabilidade)
*   **Identificação de Race Conditions**: Analisar ganchos (hooks) de subscrição em tempo real para garantir que atualizações de estado não ocorram em componentes desmontados ou com dados obsoletos (*stale closures*).
*   **Consistência de Isolamento (Tenancy)**: Verificar todas as mutações (UPSERT/UPDATE) para garantir a inclusão obrigatória do `tenant_id`, prevenindo vazamento de dados entre clientes (ex: `src/pages/Quarantine.tsx`).
*   **Tratamento de Erros e Casos de Borda**: Revisar componentes que dependem de dados externos para incluir validações defensivas contra `null`/`undefined`, evitando falhas de renderização em cascata.

#### 2. Profiling e Diagnóstico de Performance (Fase de Gargalos)
*   **Mapeamento de Re-renders**: Utilizar o *React Profiler* para detectar componentes que sofrem de pressão no Virtual DOM devido a objetos de dependência instáveis (ex: uso de `JSON.stringify` em arrays de dependência em `useRealtimeQuery`).
*   **Análise de Payload**: Identificar queries que utilizam `select('*')` em tabelas volumosas e substituir por projeções específicas, reduzindo o consumo de banda e o tempo de parsing de JSON no cliente.

#### 3. Otimização de Algoritmos e Eficiência de Recursos
*   **Refatoração O(n) em Agregações**: Substituir sequências de `.filter().length` repetitivas por loops de passagem única (*single-pass accumulation*) em ganchos de estatísticas (ex: `useInsightFeedback.ts`).
*   **Memoização Estratégica**: Aplicar `useMemo` em transformações de dados de dashboards e `useCallback` em manipuladores de eventos passados para componentes pesados para evitar quebras de `React.memo`.
*   **Gestão de Memória (RAM)**: Otimizar o ciclo de vida de canais do Supabase Realtime, garantindo que recursos sejam liberados imediatamente ao fechar abas ou navegar entre páginas.

#### 4. Validação e Entrega de Resultados
*   **Esquema de Resposta Estruturado**: Para cada problema detectado, entregar o diagnóstico, a análise da causa raiz, a correção exata em TypeScript e a justificativa técnica.
*   **Benchmarking de Carga**: Validar que a interface permanece fluida (>60 FPS) mesmo durante picos de atualização de telemetria ou em listas com centenas de itens.
