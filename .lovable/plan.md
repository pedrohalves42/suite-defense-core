## Diagnóstico

O dashboard trava com três falhas independentes nos logs:

1. **403 em RPCs** `is_super_admin`, `log_session_start`, `get_system_mode` → `permission denied for function`. As funções existem mas o `EXECUTE` foi revogado de `authenticated` (ACL atual só lista `postgres`/`service_role`/`sandbox_exec`).
2. **403 em `tenants_safe`** → a view não tem `GRANT SELECT TO authenticated`.
3. **Edge function `api-gateway` quebrada** → boot error: `does not provide an export named 'handleUnitEconomicsV2'`. O `index.ts` importa `handleUnitEconomicsV2` de `./handlers/billing-v2.ts`, mas esse arquivo só exporta `handleRevenueProjectionsV2` (entre outros). Como o boot falha, todo preflight CORS retorna não-2xx → erros em `security:clear-failed-logins` e demais chamadas via gateway.

## Correções

### 1. Migração SQL — restaurar permissões mínimas para o role `authenticated`
```sql
GRANT EXECUTE ON FUNCTION public.is_super_admin()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid)   TO authenticated; -- se sobrecarga existir
GRANT EXECUTE ON FUNCTION public.log_session_start(...) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_system_mode()      TO authenticated;
GRANT SELECT  ON public.tenants_safe                    TO authenticated;
```
As funções já são `SECURITY DEFINER` com `search_path=public` e checagens internas — conceder EXECUTE não amplia superfície além do já projetado.

### 2. Corrigir export de `handleUnitEconomicsV2`
Em `supabase/functions/api-gateway/handlers/billing-v2.ts`, adicionar a função `handleUnitEconomicsV2` (handler legítimo de "unit economics") OU remover o import + entrada `'billing:unit-economics'` em `index.ts` se a feature foi descontinuada.

Proposta padrão: implementar `handleUnitEconomicsV2` como wrapper mínimo que chama o RPC/aggregate atual de unit economics (mesmo padrão dos outros handlers do arquivo). Confirmar em seguida que o boot do gateway sobe limpo via logs.

### 3. Validação
- Re-login → confirmar que `/dashboard` carrega.
- Verificar que não há mais 403 em `is_super_admin`, `log_session_start`, `get_system_mode`, `tenants_safe`.
- Verificar logs do `api-gateway` sem `worker boot error`.

## Fora de escopo
- Refatorar arquitetura de gateway/handlers.
- Revisar todas as outras 60+ RPCs (apenas as que aparecem como 403 nos logs atuais).