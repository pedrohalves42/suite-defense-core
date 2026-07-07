# RC-2 Evidence Report — `scan-virus`

> Instância viva do template `reliability-rc2-evidence-report.template.md`.
> Preencher progressivamente durante a janela. Encerrar com decisão
> formal antes de qualquer nova adoção de Retry.

## Metadados

| Campo | Valor |
| --- | --- |
| Wave | 3A.2 |
| Função observada | `scan-virus` |
| Wrapper | `serveAgent` |
| Início da janela (`:window_start`) | **2026-07-07T13:15:00Z** |
| Encerramento da janela (`:window_end`) | _pendente_ |
| Duração efetiva | _pendente_ |
| Baseline comparativa (janela pré-3A.2) | _a definir no encerramento (mesma duração, imediatamente anterior a `:window_start`)_ |
| Responsável pelo relatório | _pendente_ |
| Versão do runtime | RC-2 |

## Snapshots de inventário (E5)

| Momento | Arquivo | Retry global | Breaker | Idempotency |
| --- | --- | ---: | ---: | ---: |
| Início | `r4-5-adoption-inventory.rc2-start.md` | 2 | 0 | 0 |
| Fim | `r4-5-adoption-inventory.rc2-end.md` (pendente) | _pendente_ | _pendente_ | _pendente_ |

Retry esperado ao encerramento:
- `serveAgent` → 1 (`scan-virus`)
- `serveTenant` → 1 (`validate-build-pipeline`)
- demais wrappers → 0
- **Total global esperado: Retry = 2, Breaker = 0, Idempotency = 0.**

## E1 — Regressão funcional

| Métrica | Baseline | Janela RC-2 | Δ | Aprovado? |
| --- | ---: | ---: | ---: | :-: |
| Scans iniciados | _pendente_ | _pendente_ | | |
| Scans concluídos com sucesso | _pendente_ | _pendente_ | | |
| Taxa de sucesso (%) | _pendente_ | _pendente_ | | |
| Escritas em `virus_scans` | _pendente_ | _pendente_ | | |
| Chamadas `update_quota_usage` | _pendente_ | _pendente_ | | |
| Invokes de `auto-quarantine` | _pendente_ | _pendente_ | | |
| Escritas duplicadas detectadas | 0 | _pendente_ | | |

Contratos HTTP inalterados: ☐  
Payload/headers/status codes inalterados: ☐

## E2 — Telemetria de retry

| Evento | Ocorrências | % sobre total de scans |
| --- | ---: | ---: |
| `reliability.retry.attempt` (attempt=1) | _pendente_ | |
| `reliability.retry.attempt` (attempt=2) | _pendente_ | |
| `reliability.retry.attempt` (attempt=3) | _pendente_ | |
| `reliability.retry.exhausted` | _pendente_ | |

Distribuição por causa (`errorCategory` / `status`):

| Categoria | Status | Ocorrências |
| --- | --- | ---: |
| transient | 429 | |
| transient | 500 | |
| transient | 502 | |
| transient | 503 | |
| transient | 504 | |
| transient | timeout | |

Checks:
- Nenhum `retry.attempt` para 404 ou demais 4xx permanentes: ☐
- `requestId` preservado em todas as tentativas: ☐
- `traceId` preservado em todas as tentativas: ☐

## E3 — Latência do handler

| Percentil | Baseline (ms) | RC-2 (ms) | Δ (ms) | Δ (%) | Aprovado? |
| --- | ---: | ---: | ---: | ---: | :-: |
| p50 | _pendente_ | _pendente_ | | | |
| p95 | _pendente_ | _pendente_ | | | |
| p99 | _pendente_ | _pendente_ | | | |

Checks:
- Aumento de p95/p99 proporcional ao volume de retries: ☐
- Nenhum scan excedeu 6s de orçamento total de retry: ☐
- Nenhum scan excedeu 30s por tentativa (`fetchWithTimeout`): ☐

## E4 — Classificação 4xx / 404

| Status | Ocorrências | Retry esperado | Retry observado |
| --- | ---: | :-: | :-: |
| 400 | | não | |
| 401 | | não | |
| 403 | | não | |
| 404 | | não | |
| 409 | | não | |
| 422 | | não | |
| 501 | | não | |
| 408 | | sim | |
| 425 | | sim | |
| 429 | | sim | |
| 500-599 (exceto 501) | | sim | |

Checks:
- `Retry-After` respeitado quando presente: ☐
- Nenhum falso-positivo (permanente classificado como transiente): ☐
- Nenhum falso-negativo (transiente classificado como permanente): ☐

## E5 — Estabilidade do inventário R4.5

| Métrica | Início | Fim | Aprovado? |
| --- | ---: | ---: | :-: |
| Total de funções escaneadas | 74 | _pendente_ | |
| Funções com Retry | 2 | _pendente_ | |
| Funções com Breaker | 0 | _pendente_ | |
| Funções com Idempotency | 0 | _pendente_ | |
| `serveAgent` Retry count | 1 | _pendente_ | |
| `serveTenant` Retry count | 1 | _pendente_ | |

Diff `rc2-start` ↔ `rc2-end`:

```
<pendente — colar diff no encerramento>
```

## E6 — Incidentes correlatos

| Data | Sistema | Severidade | Correlacionado a 3A.2? | Notas |
| --- | --- | --- | :-: | --- |
| _sem ocorrências até o momento_ | | | | |

## Consolidação

| Critério | Status |
| --- | :-: |
| E1 — Regressão funcional | ☐ |
| E2 — Telemetria de retry | ☐ |
| E3 — Latência | ☐ |
| E4 — Classificação | ☐ |
| E5 — Inventário estável | ☐ |
| E6 — Sem incidentes | ☐ |

## Decisão final

- ☐ **Promover** — abrir Wave 3B seguindo `r4-wave3b-post-idempotent-checklist.md`.
- ☐ **Estender RC-2** — manter janela por `N` dias adicionais. Justificativa: _pendente_
- ☐ **Rollback** — reverter Wave 3A.2. Motivo: _pendente_

Assinatura / data: `_________________________`

---

## Log de coleta (append-only)

Registrar cada rodada de coleta com timestamp e query executada
(referenciar seções de `reliability-rc2-evidence-queries.md`).

| Timestamp (UTC) | Query ref | Observação |
| --- | --- | --- |
| 2026-07-07T13:15:00Z | 4.1 | Snapshot inicial arquivado como `r4-5-adoption-inventory.rc2-start.md`. Retry=2, Breaker=0, Idempotency=0. |
