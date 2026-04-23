
### Plano de Auditoria Técnica e Otimização de Performance

Este plano detalha o processo de análise e refinamento do sistema para garantir segurança, estabilidade e eficiência máxima de recursos.

#### 1. Refinamento do Prompt de Auditoria (Execução Imediata)
*   **Reescrita Profissional**: Transformar o comando original em uma diretiva de engenharia de alta fidelidade, incorporando a persona de Auditor Sênior e o esquema de resposta estruturado (Diagnóstico, Causa Raiz, Correção, Justificativa).

#### 2. Auditoria de Lógica e Segurança
*   **Análise de Race Conditions**: Revisar hooks de subscrição real-time (Supabase) para garantir o cleanup correto de canais e evitar atualizações de estado em componentes desmontados.
*   **Validação de Integridade de Dados**: Verificar a lógica de filtragem de tenants e permissões em hooks como `useActiveTenant` e `useIsAdmin`.
*   **Mapeamento de Bugs Silenciosos**: Identificar *stale closures* em callbacks e dependências incorretas em `useEffect`.

#### 3. Otimização de Performance (CPU/RAM)
*   **Profiling de Renderização**: Identificar componentes que sofrem de "Virtual DOM pressure" devido a props instáveis ou processamento pesado durante o ciclo de render.
*   **Refatoração Algorítmica**: Substituir operações custosas (como múltiplos `.filter()` e `.sort()`) por passagens únicas (O(n)) e estruturas de dados otimizadas (Sets/Maps).
*   **Memoização Estratégica**: Aplicar `useMemo` e `useCallback` em pontos críticos de hooks de dados e listas extensas de agentes/jobs.
*   **Gestão de Memória**: Auditar listeners globais e timers para prevenir vazamentos de memória em sessões prolongadas.

#### 4. Entrega e Validação Técnica
*   **Implementação de Correções**: Aplicar os patches de código seguindo as melhores práticas de TypeScript e Clean Code.
*   **Relatório de Impacto**: Documentar a redução estimada no consumo de recursos e a melhoria na latência percebida pelo usuário.

---

**Prompt Reescrito:**

Como Engenheiro de Software Sênior e Auditor de Segurança, realize uma auditoria técnica rigorosa no código fornecido. Sua análise deve focar em:

1. **Auditoria de Bugs e Lógica**: Identifique falhas de segurança em fluxos de autenticação/autorização, race conditions em subscrições real-time, erros de estado em hooks complexos e inconsistências na manipulação de dados assíncronos.
2. **Otimização de Performance**: Analise o custo computacional de renders, identifique vazamentos de memória (memory leaks) em listeners, otimize a complexidade de algoritmos de processamento de dados e implemente memoização estratégica onde houver redundância.

Para cada falha ou gargalo detectado, você deve obrigatoriamente fornecer:
- **Diagnóstico Técnico**: Descrição clara e precisa do problema.
- **Análise da Causa Raiz**: Explicação técnica do motivo do erro ou da ineficiência.
- **Correção Exata**: Código revisado, tipado e pronto para implementação.
- **Justificativa e Validação**: Explicação de como a correção resolve o problema e melhora a estabilidade ou performance do sistema (CPU/RAM).

Retorne os resultados de forma estruturada, priorizando a estabilidade e a escalabilidade do sistema.
