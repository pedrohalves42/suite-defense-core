Realizei uma auditoria completa no sistema e identifiquei falhas críticas relacionadas a condições de corrida, sincronização de estado e segurança de sessões. Abaixo estão as correções exatas para cada problema.

### 1. Prevenção de Condições de Corrida no `useActiveTenant`
- **Problema:** Ao trocar de tenant, existia uma janela de tempo onde as queries podiam ser disparadas com o `tenant_id` antigo antes da atualização do JWT, causando erros de permissão ou vazamento de dados visuais.
- **Correção:** Implementar um bloqueio de estado mais rigoroso e invalidar o cache do TanStack Query de forma atômica após a confirmação da sincronização do backend.

### 2. Integridade do Gerenciamento de Realtime
- **Problema:** O `RealtimeChannelManager` não tratava adequadamente falhas de autenticação de canal, o que podia deixar hooks em estado de espera infinito sem dados novos.
- **Correção:** Adicionar lógica de reconexão exponencial e limpeza de referências órfãs quando o canal entra em estado de erro permanente.

### 3. Segurança e Robustez na Troca de Sessão
- **Problema:** O logout não limpava completamente as referências de memória no `SessionProvider`, o que poderia afetar a primeira sessão do próximo usuário na mesma aba.
- **Correção:** Garantir a destruição completa de referências e estados de auditoria durante o evento `SIGNED_OUT`.

### 4. Correção de Lógica no `CommandPalette`
- **Problema:** A busca global não filtrava caminhos administrativos para usuários com roles de visualização, gerando erros 403 ao tentar acessar recursos via atalho.
- **Correção:** Integrar o hook `useRolePermissions` para filtrar dinamicamente as opções de navegação disponíveis.

---

### Detalhes Técnicos das Alterações

#### src/hooks/useActiveTenant.tsx
- Refinamento da lógica de `syncingRef` para evitar disparos duplicados.
- Invalidação de queries agora usa `exact: false` para garantir que sub-queries de agentes também sejam atualizadas.

#### src/lib/realtime-manager.ts
- Adição de `CHANNEL_ERROR` handling com limpeza de cache interna.

#### src/components/CommandPalette.tsx
- Implementação de filtragem baseada em permissões (`can('path_access')`) para cada item da lista.
