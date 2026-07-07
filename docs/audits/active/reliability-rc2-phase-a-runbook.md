# RC-2 Fase A — Runbook de Observação

Status: **ACTIVE** desde 2026-07-07T13:15:00Z
Runtime: **FROZEN** — code changes BLOCKED

Este runbook define a rotina operacional oficial da Fase A da RC-2.
Nenhuma alteração de runtime é permitida enquanto este runbook estiver
ativo. A saída da Fase A ocorre exclusivamente pelo gate **RC-2
Evidence Review** (Fase B).

---

## 1. Cadência de coleta

### Alta frequência (diário)

Executar as queries abaixo de `reliability-rc2-evidence-queries.md` e
registrar checkpoint no relatório vivo:

| Query ref | Objetivo |
| --- | --- |
| 2.1 | `reliability.retry.attempt` por causa |
| 2.2 | `reliability.retry.exhausted` |
| 2.3 | Sanidade: nenhum retry em 4xx permanente |
| 3.2 | Duplicatas em `virus_scans` (esperado 0) |

### Baixa frequência (semanal)

| Query ref | Objetivo |
| --- | --- |
| 4.1 | Snapshot do inventário R4.5 — checar drift |
| 5.x | Incidentes correlatos |

---

## 2. Validação da telemetria de retry

Fontes:

```
reliability.retry.attempt
reliability.retry.exhausted
```

Campos obrigatórios em cada evento:

- `provider`
- `status`
- `errorCategory`
- `attempt`
- `requestId`
- `traceId`

### Resultado esperado

Retry observado apenas para status transientes:

```
429 · 408 · 425 · 5xx (exceto 501) · timeout
```

### Resultado proibido (abre investigação imediata)

Retry observado para status permanentes:

```
400 · 401 · 403 · 404 · 409 · 422 · 501
```

---

## 3. Proteção contra duplicidade

Query: seção 3.2 (`virus_scans`).

Critério: `duplicates = 0`.

Qualquer `COUNT(*) > 1` em chave de dedup **bloqueia a promoção** e
abre investigação antes de qualquer decisão da Fase B.

---

## 4. Condições que encerram antecipadamente a observação

Mesmo antes do prazo planejado, análise imediata é obrigatória se:

| Evento | Ação |
| --- | --- |
| Retry em 404/4xx permanente | investigar classifier |
| Duplicação em `virus_scans` | bloquear promoção |
| Alteração R4.5 inesperada | investigar drift |
| Incidente atribuído ao Retry | avaliar rollback |
| Alteração em wrapper/shared reliability | congelar análise |

---

## 5. Registro de checkpoint

Cada rodada de coleta gera uma entrada **append-only** na seção "Log
de coleta" de `reliability-rc2-evidence-report.md`, seguindo o
template abaixo:

```md
## RC-2 Observation Checkpoint #N

Timestamp:
YYYY-MM-DDTHH:MM:SSZ

Observations:

- retry.attempt:
  - occurrences:
  - providers:
  - categories:

- retry.exhausted:
  - occurrences:

- virus_scans duplicates:
  - 0

- inventory drift:
  - none

Decision:
Continue observation
```

Decisões válidas do checkpoint:

- `Continue observation` — rotina segue normalmente.
- `Escalate — <motivo>` — dispara Seção 4 (condição de encerramento
  antecipado).
- `Ready for Fase B` — critérios de volume/tempo atingidos, aguardar
  execução do gate RC-2 Evidence Review.

---

## 6. Transição para Fase B

A transição ocorre **somente** quando houver, cumulativamente:

```
>= 72h de observação
+
volume estatisticamente representativo de scan-virus
+
nenhum evento da Seção 4 pendente de investigação
```

### 6.1 Automação disponível

Dois scripts encapsulam o gate:

| Script | Função |
| --- | --- |
| `scripts/reliability-rc2-window-check.ts` | Watchdog: lê `:window_start` do relatório vivo, calcula horas decorridas e reporta READY/PENDING (gate de tempo **ou** volume). Read-only, ideal para cron. |
| `scripts/reliability-rc2-close.ts` | Closer: roda o scanner R4.5, gera `r4-5-adoption-inventory.rc2-end.md`, diff, e preenche E1–E6 no relatório entre marcadores `AUTO-RC2-CLOSE`. Aplica regras de gate e escreve a **decisão recomendada** (Promote / Extend / Rollback). |

Fluxo:

```bash
# 1) Verificar se o gate foi atingido
deno run --allow-read scripts/reliability-rc2-window-check.ts \
  --scans-count=<N>

# 2) Preencher inputs (schema em scripts/reliability-rc2-inputs.example.json)

# 3) Preview (dry-run)
deno run -A scripts/reliability-rc2-close.ts \
  --inputs=<path>.json --dry-run

# 4) Encerramento efetivo
deno run -A scripts/reliability-rc2-close.ts \
  --inputs=<path>.json
```

Após execução do closer, o relatório vivo contém bloco automático com
todas as tabelas E1–E6 preenchidas, diff do inventário e decisão
recomendada. **A assinatura humana permanece obrigatória** no bloco
"Decisão final" — a automação não substitui o gate humano, apenas
consolida evidências e sugere.

### 6.2 Sequência manual (referência)

1. Definir `:window_end` em `reliability-rc2-evidence-report.md`.
2. Executar pacote completo E1–E6 (seção 6 de
   `reliability-rc2-evidence-queries.md`).
3. Gerar snapshot `r4-5-adoption-inventory.rc2-end.md` e colar diff
   em E5.
4. Preencher todas as tabelas do relatório de evidências.
5. Decisão formal: **Promover** / **Estender** / **Rollback**.



---

## 7. Próximo gate

```
Próximo gate:  RC-2 Evidence Review
NÃO:           Wave 3B
```

Wave 3B permanece:

```
SPECIFICATION READY
EXECUTION BLOCKED
```

até que a decisão formal da RC-2 seja **Promover**.
