# RC-2 Evidence Report — `scan-virus` (template)

> Instanciar como `reliability-rc2-evidence-report.md` ao encerrar a
> janela de observação da RC-2. Preencher **todas** as seções antes de
> registrar a decisão final. Manter este template intacto.

## Metadados

| Campo | Valor |
| --- | --- |
| Wave | 3A.2 |
| Função observada | `scan-virus` |
| Wrapper | `serveAgent` |
| Início da janela | `YYYY-MM-DDTHH:MM:SSZ` |
| Encerramento da janela | `YYYY-MM-DDTHH:MM:SSZ` |
| Duração efetiva | `Nh` |
| Baseline comparativa (janela pré-3A.2) | `YYYY-MM-DD .. YYYY-MM-DD` |
| Responsável pelo relatório | `<nome>` |
| Versão do runtime | RC-2 |

## E1 — Regressão funcional

| Métrica | Baseline | Janela RC-2 | Δ | Aprovado? |
| --- | ---: | ---: | ---: | :-: |
| Scans iniciados | | | | |
| Scans concluídos com sucesso | | | | |
| Taxa de sucesso (%) | | | | |
| Escritas em `virus_scans` | | | | |
| Chamadas `update_quota_usage` | | | | |
| Invokes de `auto-quarantine` | | | | |
| Escritas duplicadas detectadas | 0 | | | |

Observações:
- Contratos HTTP inalterados: ☐ sim ☐ não
- Payload/headers/status codes inalterados: ☐ sim ☐ não

## E2 — Telemetria de retry

| Evento | Ocorrências | % sobre total de scans |
| --- | ---: | ---: |
| `reliability.retry.attempt` (attempt=1) | | |
| `reliability.retry.attempt` (attempt=2) | | |
| `reliability.retry.attempt` (attempt=3) | | |
| `reliability.retry.exhausted` | | |

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
| p50 | | | | | |
| p95 | | | | | |
| p99 | | | | | |

Checks:
- Aumento de p95/p99 proporcional ao volume de retries: ☐
- Nenhum scan excedeu 6s de orçamento total de retry: ☐
- Nenhum scan excedeu 30s por tentativa (`fetchWithTimeout`): ☐

## E4 — Classificação 4xx / 404

| Status | Ocorrências | Retry disparado? (esperado) | Retry disparado? (observado) |
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

Executar o scanner ao início e ao final da janela.

| Métrica | Início | Fim | Aprovado? |
| --- | ---: | ---: | :-: |
| Total de funções escaneadas | 74 | | |
| Funções com Retry | 2 | | |
| Funções com Breaker | 0 | | |
| Funções com Idempotency | 0 | | |
| `serveAgent` Retry count | 1 | | |
| `serveTenant` Retry count | 1 | | |

Diff do arquivo `r4-5-adoption-inventory.generated.md` entre início
e fim da janela (colar aqui):

```
<diff ou "sem alterações">
```

## E6 — Incidentes correlatos

| Data | Sistema | Severidade | Correlacionado a 3A.2? | Notas |
| --- | --- | --- | :-: | --- |
| | | | | |

Se nenhum incidente: marcar "**sem incidentes**".

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

- ☐ **Promover** — abrir Wave 3B seguindo o checklist congelado
      (`r4-wave3b-post-idempotent-checklist.md`).
- ☐ **Estender RC-2** — manter janela por `N` dias adicionais.
      Justificativa: `...`
- ☐ **Rollback** — reverter Wave 3A.2. Motivo: `...`

Assinatura / data: `_________________________`
