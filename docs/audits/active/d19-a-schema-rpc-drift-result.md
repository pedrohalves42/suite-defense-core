# D19-A — Schema/RPC Drift Sweep — Resultado

**Status:** Concluído
**Escopo:** Eliminar drift Banco → Typegen → Código no maior hotspot identificado (`check.repository.ts`, 11 `@ts-ignore`) + uso indireto em `run-scheduled-checks.ts`.

---

## 1. Diagnóstico de causas

| Hotspot | Causa raiz | Confirmação |
| --- | --- | --- |
| 4× `@ts-ignore: missing in types` em RPCs (`get_batch_counts`, `get_business_hours_batch`, `get_installation_health_batch`, `get_tenants_compliance_scores`) | **Typegen stale** — comentários adicionados antes de D18-2 | RPCs já presentes em `database.types.ts` (linhas 50909, 50916, 50946, 51212). Stale boundary. |
| 8× `@ts-ignore: dynamic mapping` em `getAgents`, `getInstallationAnalytics`, `getJobs` | **"Não consegui convencer o compilador"** — supabase-js exige `keyof Row` literal nos filtros encadeados | Resolvível com narrowing `key as keyof Tables[T]['Row'] & string` |
| 1× `@ts-ignore: dynamic RPC call` em `run-scheduled-checks.ts` | Boundary legítimo (nome de RPC vem do banco em runtime) | Resolvível com `Parameters<typeof rpc>[0]` |

Nenhum dos 12 `@ts-ignore` indicava drift real entre banco e typegen — todos eram **sintomas de boundary mal tipado**, não de schema divergente.

---

## 2. Correções aplicadas

### `_shared/hexagonal/repositories/check.repository.ts`
- Removidos 4 `@ts-ignore: missing in types` (RPCs já tipadas após D18-2). Substituídos tipos `any[]` no `.forEach` por shapes nominais (`Array<{ tenant_id: string; count: number | string }>` etc.) — mantém a fronteira documentada sem `any` desnecessário.
- Removidos 8 `@ts-ignore: dynamic mapping`. Adicionado narrowing local `type Col = keyof Tables['T']['Row'] & string` e cast `key as Col` no boundary do loop. Zero alteração de runtime.

### `_shared/hexagonal/use-cases/run-scheduled-checks.ts`
- Removido 1 `@ts-ignore: dynamic RPC call`. Substituído por `rpcName as Parameters<typeof this.checkRepository.rpc>[0]`. Preserva o boundary (nome dinâmico vindo do banco) sem escape global de tipo.

---

## 3. Validação

```
deno check _shared/hexagonal/repositories/check.repository.ts  → PASS
deno check _shared/hexagonal/use-cases/run-scheduled-checks.ts → PASS
```

Inventário pós-D19-A:

| Indicador | Antes | Depois |
| --- | ---: | ---: |
| `@ts-ignore` totais (excluindo testes) | 12 | **0** |
| `@ts-ignore` em testes (mocks legítimos) | 6 | 6 |
| `as any` introduzidos | — | 0 |
| `as never` introduzidos | — | 0 |
| Alteração de runtime | — | Não |
| Type Escape Index — contribuição de `@ts-ignore` | 130 | **60** (somente testes) |

---

## 4. Casts remanescentes (auditáveis)

| Local | Tipo | Justificativa |
| --- | --- | --- |
| `getCount`, `findExistingAlert`, `findExistingInsight` (~5 casts `as any`) | `as any` em chains dinâmicas de query builder | Mesma classe do "dynamic mapping" — pode ser eliminado em D19-B como item de baixa prioridade |
| `getBatchCounts/getBusinessHoursBatch/...` retornos `Record<string, any>` | `any` no shape do payload | Boundary RPC → consumidor heterogêneo. Classificável em D19-B. |
| Testes (`charge-subscription.test.ts`) | 6× `@ts-ignore` para spy de mock | Boundary de teste — aceito. |

---

## 5. Próximo passo recomendado

**D19-B — Type Escape Inventory** (apenas classificação, sem correções).

Categorias a aplicar:
- Boundary externo legítimo → **aceitar**
- Compatibilidade SDK → **reduzir**
- Drift schema → **eliminar** (esperado: 0 após D19-A)
- Conveniência → **eliminar primeiro**

Type Escape Index atual estimado: **1292** (queda de 70 pontos vs. baseline 1362 reportado, exclusivamente em peso de `@ts-ignore`).
