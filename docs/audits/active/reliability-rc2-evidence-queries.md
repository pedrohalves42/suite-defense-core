# RC-2 Evidence Collection — Queries & Filters

Consultas e filtros para instrumentar a coleta de evidências da
janela de observação RC-2 (`scan-virus`, Wave 3A.2). Toda a coleta é
**read-only**. Nenhuma query aqui modifica estado.

Convenções:

- `:window_start` / `:window_end` — bordas da janela RC-2 (UTC, ISO8601).
- `:baseline_start` / `:baseline_end` — janela comparativa pré-3A.2
  de duração equivalente.
- Ambiente: produção. Executar as mesmas queries em staging antes
  para validar shape.

---

## 1. Edge function logs — filtros base

Fonte: `supabase--edge_function_logs` (tool) para leitura rápida, e
`function_edge_logs` (analytics) para agregações.

### 1.1 Todas as invocações de `scan-virus` na janela

```sql
select
  id,
  function_edge_logs.timestamp,
  event_message,
  response.status_code,
  request.method,
  m.execution_time_ms,
  m.deployment_id,
  m.version
from function_edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as response
  cross join unnest(m.request) as request
where m.function_id = '<scan-virus function id>'
  and function_edge_logs.timestamp between :window_start and :window_end
order by function_edge_logs.timestamp desc
limit 1000;
```

### 1.2 Contagem e taxa de sucesso (RC-2 vs baseline)

```sql
select
  case
    when function_edge_logs.timestamp between :baseline_start and :baseline_end then 'baseline'
    when function_edge_logs.timestamp between :window_start and :window_end then 'rc2'
  end as bucket,
  count(*) as invocations,
  count(*) filter (where response.status_code between 200 and 299) as ok,
  round(100.0 * count(*) filter (where response.status_code between 200 and 299) / count(*), 2) as ok_pct
from function_edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as response
where m.function_id = '<scan-virus function id>'
  and (
    function_edge_logs.timestamp between :baseline_start and :baseline_end
    or function_edge_logs.timestamp between :window_start and :window_end
  )
group by bucket;
```

### 1.3 Percentis de latência (E3)

```sql
select
  case
    when function_edge_logs.timestamp between :baseline_start and :baseline_end then 'baseline'
    when function_edge_logs.timestamp between :window_start and :window_end then 'rc2'
  end as bucket,
  approx_quantiles(m.execution_time_ms, 100)[offset(50)] as p50_ms,
  approx_quantiles(m.execution_time_ms, 100)[offset(95)] as p95_ms,
  approx_quantiles(m.execution_time_ms, 100)[offset(99)] as p99_ms,
  max(m.execution_time_ms) as max_ms
from function_edge_logs
  cross join unnest(metadata) as m
where m.function_id = '<scan-virus function id>'
  and (
    function_edge_logs.timestamp between :baseline_start and :baseline_end
    or function_edge_logs.timestamp between :window_start and :window_end
  )
group by bucket;
```

---

## 2. Telemetria de retry (E2 / E4)

Fonte: eventos estruturados emitidos por `withRetry` via `logger`:

- `reliability.retry.attempt`
- `reliability.retry.exhausted`

### 2.1 Retry attempts por causa (busca textual)

Via `supabase--edge_function_logs` com filtro:

```
function_name = scan-virus
search        = reliability.retry.attempt
```

Consolidar contagem por `attempt`, `errorCategory` e `status` no
relatório (E2).

### 2.2 Retry exhausted

```
function_name = scan-virus
search        = reliability.retry.exhausted
```

Para cada ocorrência, registrar: `requestId`, `lastCategory`,
`lastStatus`, `totalElapsedMs`.

### 2.3 Sanidade — nenhum retry em 4xx permanente

Buscar co-ocorrência proibida:

```
search = reliability.retry.attempt
```

filtrar programaticamente entradas onde `status` ∈
{400, 401, 403, 404, 409, 422, 501}. **Contagem esperada: 0.**

### 2.4 Correlação `requestId` / `traceId`

Amostrar 20 `requestId` distintos com `attempt >= 2` e confirmar
que todas as linhas de log da mesma invocação carregam o mesmo
`requestId` (e `traceId` quando presente).

---

## 3. Persistência (E1)

Fonte: banco (`supabase--read_query`).

### 3.1 Volume de escritas na janela

```sql
select
  date_trunc('hour', created_at) as hour,
  count(*) as scans_written
from public.virus_scans
where created_at between :window_start and :window_end
group by 1
order by 1;
```

### 3.2 Detecção de escritas duplicadas

Assumindo dedup key `(tenant_id, file_hash)` (ajustar ao schema real):

```sql
select
  tenant_id,
  file_hash,
  count(*) as duplicates
from public.virus_scans
where created_at between :window_start and :window_end
group by tenant_id, file_hash
having count(*) > 1;
```

**Contagem esperada de linhas: 0.**

### 3.3 Consistência `virus_scans` ↔ invocações OK

Cross-check: número de scans 2xx (query 1.2) vs número de linhas
inseridas em `virus_scans` na mesma janela (query 3.1). Diferença
esperada: 0 (ou explicada por casos documentados de "not found").

---

## 4. Inventário R4.5 (E5)

### 4.1 Snapshot início

Executar o scanner R4.5 e arquivar
`docs/audits/active/r4-5-adoption-inventory.generated.md` como
`r4-5-adoption-inventory.rc2-start.md`.

### 4.2 Snapshot fim

Re-executar ao final da janela e arquivar como
`r4-5-adoption-inventory.rc2-end.md`.

### 4.3 Diff

```bash
diff \
  docs/audits/active/r4-5-adoption-inventory.rc2-start.md \
  docs/audits/active/r4-5-adoption-inventory.rc2-end.md
```

**Diff esperado: vazio.** Qualquer diferença invalida E5 até
justificativa formal.

### 4.4 Contagens agregadas esperadas

| Wrapper | Retry esperado |
| --- | ---: |
| `serveAgent` | 1 (`scan-virus`) |
| `serveTenant` | 1 (`validate-build-pipeline`) |
| demais | 0 |

Total global: **Retry = 2, Breaker = 0, Idempotency = 0**.

---

## 5. Incidentes correlatos (E6)

### 5.1 Alertas / incidentes tocando `scan-virus`

```sql
select
  id,
  created_at,
  severity,
  title,
  source
from public.system_alerts
where created_at between :window_start and :window_end
  and (
    title ilike '%scan-virus%'
    or title ilike '%virus_scans%'
    or title ilike '%reliability%'
  )
order by created_at desc;
```

### 5.2 Deploys / hotfixes em arquivos protegidos

Verificar via git log (fora do banco) que nenhum commit na janela
tocou:

- `supabase/functions/scan-virus/**`
- `supabase/functions/_shared/reliability/**`
- `supabase/functions/_shared/serve*.ts`
- `supabase/functions/_shared/composePipeline.ts`

---

## 6. Ordem de execução recomendada

1. Registrar `:window_start` e capturar snapshot R4.5 (4.1).
2. Durante a janela: monitorar 2.1 / 2.2 / 3.2 diariamente.
3. No encerramento:
   1. Registrar `:window_end`.
   2. Rodar 1.2, 1.3 (E1 + E3).
   3. Consolidar 2.1 / 2.2 / 2.3 / 2.4 (E2 + E4).
   4. Rodar 3.1 / 3.2 / 3.3 (E1).
   5. Snapshot R4.5 fim + diff (4.2 / 4.3).
   6. Rodar 5.1 (E6).
4. Preencher `reliability-rc2-evidence-report.md` a partir do
   template.
5. Registrar decisão final (Promover / Estender / Rollback).

Nenhuma query neste documento altera estado. Toda coleta é
**read-only**.
