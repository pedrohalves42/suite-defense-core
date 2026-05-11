Plano para destravar o dashboard:

1. Corrigir permissões de tabela/view usadas no bootstrap
- Garantir acesso de leitura para usuários autenticados em `user_roles`, `tenants` e `tenants_safe`.
- Manter RLS ativa e restringir `user_roles` para o próprio usuário, o tenant ativo ou super admin.
- Ajustar `tenants_safe` para permitir bootstrap seguro do tenant quando ainda não existe `active_tenant_id` no JWT.

2. Corrigir funções chamadas no carregamento
- Reaplicar `EXECUTE` para `authenticated` nos RPCs necessários: `is_super_admin(uuid)`, `log_session_start(text, text)` e `get_system_mode()`.
- Garantir que funções auxiliares usadas por policies (`has_role`, `is_current_super_admin`, `get_active_tenant_id`) continuam executáveis apenas pelos papéis necessários.

3. Validar após migration
- Consultar políticas e grants efetivos no backend.
- Conferir logs/requests críticos para confirmar que `user_roles`, `tenants_safe`, `is_super_admin`, `log_session_start` e `get_system_mode` deixam de retornar 403.

Detalhes técnicos:
- O backend está saudável.
- A falha principal atual ainda é `403` em `user_roles` apesar da policy existir, indicando permissões/grants e/ou bootstrap do tenant incompletos.
- Os avisos de iframe, RudderStack, Meta Pixel, 412/preview e extensão de browser não são a causa do dashboard travado.