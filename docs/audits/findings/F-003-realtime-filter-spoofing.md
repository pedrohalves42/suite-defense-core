# Diagnóstico: Risco de Spoofing em Filtros Realtime (Client-Side Filtering)

# Contexto Sistêmico
O sistema utiliza o Supabase Realtime para atualizar o dashboard. O frontend assina canais e aplica filtros de `tenant_id` via código client-side.

# Evidência Técnica
Arquivo `src/hooks/useRealtimeHooks.ts`:
```typescript
export function useRealtimeAgents(tenantId: string | undefined, ...) {
  return useRealtimeQuery({
    // ...
    realtimeFilter: tenantId ? `tenant_id=eq.${tenantId}` : undefined, // <--- FILTRO CLIENT-SIDE
  });
}
```

# Fluxo Afetado
Visualização de agentes, jobs e alertas em tempo real no dashboard.

# Impacto Arquitetural
A arquitetura depende da confiança no cliente para filtrar os dados. No Supabase Realtime, se o RLS não estiver habilitado para a publicação de realtime ou se o usuário tiver acesso a múltiplas linhas no banco, ele pode simplesmente alterar o filtro no console do navegador para assinar eventos de outro tenant.

# Impacto em Segurança
**Vazamento de dados Multi-Tenant.** Se um usuário tem permissão de leitura em mais de um tenant (ex: um operador compartilhado), ele pode "escutar" todos os eventos de todos os tenants simultaneamente, mesmo que o dashboard mostre apenas um.

# Impacto Multi-Tenant
O isolamento de dados em tempo real está comprometido se não houver uma política de RLS estrita que valide o `active_tenant_id` do JWT para *cada evento* de realtime enviado pelo servidor.

# Correção Recomendada
1. Garantir que as tabelas em `supabase_realtime` tenham RLS habilitado e usem `get_active_tenant_id()`.
2. Utilizar prefixos de canal por tenant no servidor e validar a assinatura no backend.

# Refatoração Estrutural
Migrar para o padrão de canais isolados por tenant: `tenant:{id}:agents`.

# Como Validar
No console do navegador, tentar executar:
```javascript
supabase.channel('custom-listen').on('postgres_changes', { event: '*', schema: 'public', table: 'agents', filter: 'tenant_id=eq.ID_DE_OUTRO_TENANT' }, (p) => console.log(p)).subscribe()
```
Se receber atualizações de um tenant diferente do ativo, o isolamento falhou.

# Severidade
- MÉDIO

# Veredito Final
A implementação atual de realtime é funcional mas frágil sob o ponto de vista de segurança ofensiva, dependendo excessivamente de filtros client-side para o isolamento.
