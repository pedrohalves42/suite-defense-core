
### Diagnóstico e Plano de Auditoria Técnica

Este plano aborda falhas críticas de performance e lógica detectadas na exploração do código.

#### 1. Correção de Falhas de Lógica e Bugs
*   **Problema: Tempestade de Requisições na Busca (`Quarantine.tsx`)**
    *   **Causa Raiz**: O estado `searchTerm` está diretamente vinculado à `queryKey` do React Query. Cada caractere digitado dispara uma nova requisição assíncrona, congestionando a rede e o thread principal.
    *   **Correção**: Implementar um `useDebounce` de 300ms para a variável de busca antes de passá-la para o hook `useQuery`.
*   **Problema: Instabilidade em Subscrições Realtime (`useRealtimeQuery.ts`)**
    *   **Causa Raiz**: O uso de `JSON.stringify` no array de dependências do `useEffect` força o React a serializar objetos complexos em cada ciclo de renderização, gerando desperdício de CPU.
    *   **Correção**: Utilizar referências estáveis para as chaves ou implementar uma comparação profunda customizada que evite a serialização repetitiva de strings.
*   **Problema: Race Condition no Contexto de Tenant (`useAgentSystemMetrics.ts`)**
    *   **Causa Raiz**: Embora existam checks, alguns hooks podem disparar chamadas antes que o `activeTenant` esteja completamente hidratado pelo provedor de sessão.
    *   **Correção**: Reforçar a lógica de `enabled` no React Query para garantir que nenhuma query seja disparada se `loading` for verdadeiro ou `activeTenant` nulo.

#### 2. Otimização de Performance (CPU/RAM)
*   **Virtualização de Interface (DOM RAM Optimization)**:
    *   **Gargalo**: Páginas como `Quarantine.tsx` renderizam centenas de linhas de tabela simultaneamente.
    *   **Solução**: Implementar `react-window` para renderização virtual, mantendo apenas os itens visíveis no DOM. Isso reduz o uso de RAM em até 80% em listas grandes.
*   **Otimização de Algoritmos de Métricas (`useDashboardMetrics.ts`)**:
    *   **Gargalo**: Múltiplas criações de `new Date()` dentro de loops O(n) durante o cálculo de status de agentes.
    *   **Solução**: Pré-processar o timestamp atual fora do loop e utilizar aritmética simples de números em vez de objetos de data para as comparações de heartbeat.
*   **Redução de Overhead de Re-renderização**:
    *   **Gargalo**: Componentes de layout globais (Sidebar/Navbar) re-renderizando durante atualizações rápidas de telemetria.
    *   **Solução**: Aplicar `React.memo` com funções de comparação de propriedades (props) para isolar o layout estático dos fluxos de dados voláteis.

#### 3. Eficiência de Dados e Rede
*   **Estratégia de Column Pruning**: Revisar queries Supabase para selecionar apenas as colunas consumidas pela UI (ex: remover payloads de metadados brutos em listagens de resumo).
*   **Otimização de Cache**: Configurar `staleTime` diferenciado: 15min para dados estruturais (tenants/permissões) e 10s para telemetria, evitando sobrecarga desnecessária no banco de dados.
