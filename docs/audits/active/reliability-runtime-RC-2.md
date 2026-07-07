# Reliability Runtime — RC-2 (observation)

Date: 2026-07-07
Status: **Release Candidate 2 — observation window OPEN**

RC-2 formaliza a janela de observação aberta imediatamente após o ship
da **Wave 3A.2** (`scan-virus`, Retry em GETs externos de VirusTotal e
Hybrid Analysis). Nenhuma primitiva, wrapper ou adoção adicional é
alterada sob RC-2 — apenas coleta de evidências operacionais e
preparação (spec only) da Wave 3B.

Este documento espelha o `reliability-runtime-RC-1.md` e estende-o com
os critérios específicos de saída da RC-2.

## Frozen scope

| Block | Status |
| --- | --- |
| R1 / R1.5 (inventory + closure) | ✅ frozen |
| R2 (Runtime Standard RFC) | ✅ frozen |
| R3 / R3.1 (Retry/Timeout/Breaker/Idempotency + classifier) | ✅ frozen |
| R4-prep | ✅ frozen |
| R4 Wave 1 (wrappers via `composePipeline`) | ✅ frozen |
| R4 Wave 2 (staging equivalence) | ✅ frozen |
| R4 Wave 3A.1 (`validate-build-pipeline`) | ✅ RC-1 closed |
| R4 Wave 3A.2 (`scan-virus`) | 🟡 shipped — RC-2 observing |
| R4 Wave 3B (POST idempotente / retry controlado) | 🔒 spec-only, checklist frozen |
| R5 (Reliability Score) | 🔒 spec-only, no computation |

## Frozen invariants under RC-2

1. `withRetry` é usado em exatamente **duas** edge functions em
   produção:
   - `validate-build-pipeline` — GitHub GETs (RC-1, closed).
   - `scan-virus` — Hybrid Analysis + VirusTotal lookup GETs (Wave
     3A.2, sob observação RC-2). Insert em `virus_scans`,
     `update_quota_usage` RPC e invoke de `auto-quarantine` permanecem
     **fora** do envelope de retry.
2. `fetchWithTimeout` preservado como timeout por tentativa; Retry não
   o substitui.
3. Nenhum handler é envolvido em Retry como um todo.
4. Nenhum contrato HTTP, payload, header ou status code alterado.
5. Nenhum Circuit Breaker adotado em produção.
6. Nenhuma Idempotency adotada em produção.
7. R5 Score **não** é computado. Inventário R4.5 permanece a única
   métrica quantitativa autorizada.
8. Scanner R4.5 permanece a única fonte de verdade de adoção.

## Explicitamente fora de escopo enquanto RC-2 observa

- Adotar Retry em qualquer função adicional.
- Qualquer alteração em `_shared/reliability/*`.
- Qualquer alteração em wrappers `serve*` ou `composePipeline`.
- Criação da tabela `idempotency_records` ou infra correlata.
- Recomputação ou publicação de qualquer Reliability Score.
- Início da Wave 3B (mesmo com checklist congelado).

## Exit criteria (RC-2 → Wave 3B ou GA)

RC-2 encerra — habilitando a decisão sobre abrir a Wave 3B — somente
quando o relatório de evidências (ver
`reliability-rc2-evidence-report.template.md`) demonstra
**cumulativamente**:

### E1. Ausência de regressão funcional em `scan-virus`
- Taxa de scans concluídos com sucesso equivalente à baseline
  pré-3A.2 (janela comparativa de igual duração).
- Zero divergência em contratos HTTP, payload ou status code.
- Zero escrita duplicada em `virus_scans` (chave dedup preservada).
- `update_quota_usage` e invoke de `auto-quarantine` executados
  exatamente uma vez por scan concluído.

### E2. Telemetria de retry consistente com R3.1
- `reliability.retry.attempt` observado em tráfego real com
  distribuição por causa (`errorCategory`, `status`) plausível para
  VirusTotal e Hybrid Analysis (predominância de 429 / 5xx / timeout).
- `reliability.retry.exhausted` presente apenas quando a causa é
  transiente e o orçamento total (6s) foi consumido.
- Nenhuma emissão de `retry.attempt` para 404 ou demais 4xx
  permanentes.
- `requestId` / `traceId` preservados em todas as tentativas.

### E3. Latência dentro do envelope esperado
- p50 do handler sem aumento estatisticamente relevante versus
  baseline pré-3A.2.
- p95 e p99 podem aumentar apenas em proporção ao volume de erros
  transientes efetivamente retentados, sem cauda inesperada.
- Nenhum scan excede o orçamento total de 6s de retry além do já
  contabilizado pelo `fetchWithTimeout` (30s por tentativa).

### E4. Classificação correta de erros
- 404 retornado como `null` sem retry indevido.
- 400 / 401 / 403 / 409 / 422 / 501 fluem para o caminho de erro
  original, sem retry.
- 408 / 425 / 429 / 5xx (exceto 501) são os únicos a disparar retry.
- `Retry-After` respeitado quando presente na resposta.

### E5. Estabilidade do inventário R4.5
- Scanner continua reportando exatamente **2 funções** com Retry
  habilitado (`validate-build-pipeline`, `scan-virus`).
- Nenhuma adoção acidental de Retry, Breaker ou Idempotency em
  qualquer outra função.
- Rollup por wrapper permanece estável: `serveAgent` (1 Retry),
  `serveTenant` (1 Retry), demais wrappers em zero.

### E6. Ausência de incidentes correlatos
- Nenhum incidente aberto ou hotfix tocando `scan-virus`,
  `_shared/reliability/*` ou wrappers durante a janela.
- Nenhum alerta operacional atribuído à adoção de Retry.

## Rollback

Reverter o diff de `supabase/functions/scan-virus/index.ts` restaura o
comportamento anterior exatamente. Nenhuma dependência de schema,
dado ou configuração. Após rollback, scanner R4.5 volta a reportar
1 função com Retry habilitado.

## Encerramento

O encerramento formal da RC-2 é registrado ao final do documento
`reliability-rc2-evidence-report.md` (instanciado a partir do
template), com decisão explícita:

- ✅ **Promover** — abrir Wave 3B seguindo o checklist congelado.
- ⏸️ **Estender** — manter RC-2 aberto por N dias adicionais com
  justificativa.
- ❌ **Rollback** — reverter Wave 3A.2 e reabrir análise.

Até essa decisão, o runtime permanece **frozen** e nenhuma alteração
de confiabilidade é enviada a produção.
