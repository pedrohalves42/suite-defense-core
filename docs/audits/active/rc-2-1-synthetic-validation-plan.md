# RC-2.1 — Synthetic Validation Plan

Date: 2026-07-07
Status: **PLANNED** — a executar durante RC-2 Hold
Parent gate: RC-2 (`reliability-runtime-RC-2.md` +
`reliability-runtime-RC-2-reframe.md`)

Fase intermediária dentro da RC-2. Substitui a coleta de tráfego real
enquanto o sistema não tem clientes comerciais. Objetivo: exercitar o
envelope de Retry de `scan-virus` (Wave 3A.2) em cenários controlados
e reprodutíveis.

Runtime permanece **frozen**. Nenhuma alteração de código de runtime é
autorizada por esta fase.

---

## 1. Tenants sintéticos

Criar (ou reaproveitar) no ambiente atual:

| Tenant | Uso | Notas |
| --- | --- | --- |
| `synthetic-happy` | Fluxos felizes | apenas 2xx, sem provocação de erro |
| `synthetic-chaos` | Erros provocados | 429, 500, timeout, agente offline |

Ambos isolados por RLS. Nenhum dado real. Nenhum billing.

---

## 2. Agentes simulados

Um por SO, cada um em VM/container descartável:

- Windows (agente v5).
- Linux (agente unix).
- macOS (agente unix).

Cada agente executa o ciclo completo: enroll → heartbeat → scan →
report → update-check.

---

## 3. Corpus de arquivos

| Categoria | Origem | Esperado |
| --- | --- | --- |
| Limpo | arquivo neutro | 2xx, `virus_scans` OK |
| EICAR | vetor público | detecção positiva |
| Hash conhecido positivo (VT) | lookup only | detecção via lookup, sem upload |
| Hash desconhecido | random | `not found` → 404 no lookup, sem retry |

---

## 4. Cenários provocados

Injeção controlada (via mock/proxy configurado no ambiente sintético,
**sem tocar `_shared/reliability/*`**):

| Cenário | Provocação | Esperado |
| --- | --- | --- |
| VT 429 | rate-limit forçado | retry até 3, sucesso |
| VT 500 | erro transiente | retry até 3, sucesso ou exhausted |
| VT timeout | latência > 30s | timeout por tentativa + retry |
| HA 502 | provider down | retry até 3, exhausted |
| HA 404 | hash desconhecido | sem retry |
| Agente offline | kill do processo | heartbeat stale + alerta |
| Update falhando | binário inválido | rollback do update |

Cada cenário gera pelo menos uma amostra por execução da suíte.

---

## 4.1 Matriz de cobertura (evidência obrigatória)

Cada execução da suíte precisa provar cobertura completa desta matriz.
Falta de evidência em qualquer linha invalida a execução.

| Cenário | Resultado esperado | Fonte de evidência |
| --- | --- | --- |
| Scan limpo | Resultado benigno | log `scan-virus` + linha em `virus_scans` |
| Malware detectado (EICAR) | Quarentena disparada | evento `auto-quarantine` + estado do arquivo |
| Timeout API upstream | Retry acionado | telemetria `reliability.retry.attempt` |
| 429 provider | `Retry-After` respeitado | telemetria retry + status upstream |
| API indisponível | Fallback ou exhausted controlado | log `reliability.retry.exhausted` |
| Agente offline | Alerta emitido | dashboard + `system_alerts` |
| Atualização de agente | Versão nova aplicada | release log + heartbeat pós-update |
| Rollback de update | Versão anterior restaurada | release log + heartbeat pós-rollback |

## 5. Registro

Cada execução da suíte:

1. Cria checkpoint no `reliability-rc2-evidence-report.md` com prefixo
   `SYNTHETIC-<N>` (não conta como evidência de carga real).
2. Popula seções análogas ao E1–E6, mas rotuladas
   `E1-SYNTHETIC` etc.
3. Não permite decisão `Promote` (o closer emite `Hold` enquanto o
   volume for sintético).

---

## 6. Critérios de saída da RC-2.1

- Suíte executada ao menos **3 vezes** em dias distintos.
- Todos os cenários da tabela 4 exercitados sem regressão.
- Bugs P0/P1 encontrados: 0 abertos, 100% dos fechados com evidência.
- Zero duplicatas em `virus_scans` mesmo sob 429/500/timeout forçados.
- Zero `retry.attempt` em 400/401/403/404/409/422/501.

Cumpridos os critérios: RC-2.1 é encerrada. A partir daí, a RC-2
aguarda **workload real** (primeiro tenant piloto) para poder emitir
`Promote`.

---

## 7. O que RC-2.1 NÃO faz

- Não substitui evidência de carga real.
- Não desbloqueia Wave 3B.
- Não computa R5 Score.
- Não altera invariantes RC-2.
- Não autoriza comercialização (isso é o Commercial Readiness Gate).
