

# Correção: `check-tenant-abuse` quebrado em produção

## Diagnóstico (causa raiz confirmada)

Logs da edge function (últimos 5 min):
```
code: "42703"  → column tenants.status does not exist
```

A função em `supabase/functions/check-tenant-abuse/index.ts` faz:
```ts
.from('tenants').select('id, name').eq('status', 'active')
```

Mas a tabela `public.tenants` **não tem coluna `status`**. A coluna real para estado do inquilino é `suspension_status` (valores observados em produção: `active`). Resultado: a query falha com 500, **nenhum tenant é verificado, nenhum alerta de abuso é gerado** desde que o schema mudou.

## Fim (estado desejado)

- `check-tenant-abuse` executa com sucesso pelo cron interno.
- Todos os 16 tenants ativos são varridos a cada execução.
- Alertas de abuso voltam a popular `system_alerts`.
- Log estruturado mostra `tenants_checked: 16` em vez de erro 42703.

## Meio (mudanças)

### Arquivo único: `supabase/functions/check-tenant-abuse/index.ts`

Trocar o filtro de `status` para `suspension_status`:

```diff
- .from('tenants')
- .select('id, name')
- .eq('status', 'active');
+ .from('tenants')
+ .select('id, name')
+ .eq('suspension_status', 'active');
```

Nenhuma outra alteração na função — o restante (jobs/hour, failed_login_attempts, agents over limit, persistência em `system_alerts`) já está correto e referencia colunas válidas.

## Início → execução

1. Aplicar o patch acima em `supabase/functions/check-tenant-abuse/index.ts`.
2. Deploy da função (`supabase--deploy_edge_functions` com `["check-tenant-abuse"]`).
3. Validação em produção:
   - Invocar via `supabase--curl_edge_functions` com header de cron, esperar `200` e `tenants_checked: 16`.
   - Conferir `supabase--edge_function_logs` para confirmar ausência de `42703` e presença de `check-tenant-abuse completed`.
4. Verificar `system_alerts` (somente leitura) para confirmar que novos alertas, se houver, foram inseridos com sucesso.

## Riscos / rollback

- Risco: nulo — troca de nome de coluna por outra já existente, schema idêntico do ponto de vista da função.
- Rollback: reverter o diff de uma linha caso surja regressão (improvável).

## Follow-up sugerido (fora deste escopo)

Adicionar este filtro de coluna ao gate `scripts/check-tenant-queries.sh` ou a um teste Deno mínimo (`index.test.ts`) para que uma futura renomeação de `suspension_status` quebre o CI antes de chegar à produção.

