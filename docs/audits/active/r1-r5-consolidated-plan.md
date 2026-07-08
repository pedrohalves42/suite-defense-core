# Programa R1–R5 — Plano consolidado (pós reframe RC-2)

Data: 2026-07-07 (atualizado com reframe RC-2 → Validation Gate)
Status: **RC-2 ACTIVE (validation gate, no commercial traffic)** —
runtime frozen, decisão esperada **Hold — hardening required**

> Reframe registrado em
> `docs/audits/active/reliability-runtime-RC-2-reframe.md`. RC-2 deixa
> de ser "observação pós-produção" e passa a ser "pré-produção
> controlada + readiness validation".
marcando o que já está congelado e o que ainda depende de evidências ou
decisões futuras. **Nenhuma etapa "a fazer" envolve alteração de código
enquanto a janela RC-2 estiver aberta.**

---

## 1. O que já foi resolvido (congelado)

### Fundamentos (R1 → R3.1)
- **R1 / R1.5** — Inventário de edge functions e closure.
- **R2** — Runtime Standard RFC.
- **R3** — RFC de Retry / Timeout / Breaker / Idempotency.
- **R3.1** — Error classifier + behavior table.
- **R4-prep** — Preparação da adoção.

### Implementação (R4)
- **Wave 1** — Wrappers migrados via `composePipeline`, equivalência
  comprovada.
- **Wave 2** — Validação em staging concluída.
- **Wave 3A.1** — `withRetry` em `validate-build-pipeline` (GitHub
  GETs). RC-1 encerrada sem regressão.
- **Wave 3A.2** — `withRetry` em `scan-virus` (VirusTotal + Hybrid
  Analysis GETs, via `lookupGet()`). Persistência (`virus_scans`,
  `update_quota_usage`, `auto-quarantine`) permanece fora do envelope
  de retry.

### Governança e observação
- **R4.5** — Scanner de inventário como única fonte de verdade
  quantitativa (2/74 funções com Retry).
- **RC-1** — Documento congelado (`reliability-runtime-RC-1.md`).
- **RC-2** — Janela **aberta em 2026-07-07T13:15:00Z**:
  - `reliability-runtime-RC-2.md` (critérios de saída E1–E6).
  - `reliability-rc2-evidence-report.md` (instância viva).
  - `reliability-rc2-evidence-queries.md` (queries read-only).
  - `r4-5-adoption-inventory.rc2-start.md` (snapshot inicial).
- **Wave 3B** — Checklist de pré-aprovação congelado
  (`r4-wave3b-post-idempotent-checklist.md`), sem execução.

---

## 2. Estado atual

```
Runtime Reliability:   RC-2 Validation Gate ACTIVE (no commercial traffic)
Adoption:              2/74 functions with Retry (frozen)
Wrappers:              serveAgent=1, serveTenant=1, others=0
Breaker / Idempotency: 0 in production
Evidence:              PENDING real workload
R5 Score:              not computed (spec-only)
Priority:              bug fixing + hardening
```

| Bloco | Status |
| --- | --- |
| R1 / R1.5 / R2 / R3 / R3.1 / R4-prep | ✅ congelado |
| Wave 1 / Wave 2 | ✅ congelado |
| Wave 3A.1 (`validate-build-pipeline`) | ✅ RC-1 encerrada |
| Wave 3A.2 (`scan-virus`) | 🟡 shipped — RC-2 aberta |
| RC-2 validation gate | 🟡 Hold — hardening required |
| RC-2.1 Synthetic Validation | 📋 planejada (`rc-2-1-synthetic-validation-plan.md`) |
| Commercial Readiness Gate | ⬜ OPEN (`commercial-readiness-gate.md`) |
| Wave 3B (POST idempotente) | 🔒 checklist congelado, sem execução |
| R5 (Reliability Score) | 🔒 spec-only |

---

## 3. O que falta resolver

### Fase Hardening — bug fixing + estabilização (prioridade atual)

Sem novas waves. Foco em fechar bugs conhecidos por prioridade:

**P0** (bloqueadores): erros que quebram scan, falhas de auth, perda
de dados, inconsistência multi-tenant, jobs travados, agentes offline
não detectados.

**P1**: UX, alertas, performance, logs, relatórios.

### Fase RC-2.1 — Synthetic Validation

Executar plano em `rc-2-1-synthetic-validation-plan.md`: tenants
sintéticos, agentes simulados por SO, corpus de arquivos conhecidos,
cenários provocados (429, 500, timeout, offline). Mínimo 3 execuções
em dias distintos. Checkpoints marcados `SYNTHETIC-*` — não contam
como carga real.

### Fase Commercial Readiness

Checklist completo em `commercial-readiness-gate.md`. Bloqueia o
primeiro cliente até 100% ✅ com assinaturas de Engineering,
Segurança e Produto.

### Fase Piloto — primeiro tenant real

Somente após Hardening + RC-2.1 + Commercial Readiness ✅. Gera a
evidência de workload real que a RC-2 precisa para emitir `Promote`.

### Fase B — Encerramento da RC-2

Executado com evidência real (não sintética). O closer
(`scripts/reliability-rc2-close.ts`) já reconhece o cenário e emite
`Hold` automaticamente quando o volume é insuficiente. Decisões:

- ✅ **Promote** → abre Fase C.
- ⏸️ **Extend** → mantém RC-2 aberta.
- 🛠️ **Hold** → hardening required (decisão atual esperada).
- ❌ **Rollback** → reverte diff de `scan-virus/index.ts`.


### Fase C — Wave 3B (POST idempotente / Retry controlado)

Só inicia após decisão "Promover" da RC-2. Passos, na ordem:

1. **Pré-condição adicional** — especificação de `Idempotency-Key`
   (R3-D) formalmente aprovada; Wave 3B **depende** dela para qualquer
   POST não naturalmente idempotente.
2. **Triagem final** dos candidatos listados no checklist
   (`ai-router`, `ops-gateway`, `submit-hmac-router`,
   `submit-job-result`) — selecionar exatamente **1** função para
   3B.1.
3. **Implementação 3B.1** — Retry apenas na chamada externa upstream,
   com `idempotent: true`, `method: 'POST'`, persistência fora do
   envelope.
4. **Validação em staging** — telemetria `reliability.retry.attempt`
   observada antes de promover.
5. **Ship 3B.1 → abre RC-3** — nova janela de observação, espelhando
   estrutura da RC-2 (documento `reliability-runtime-RC-3.md`,
   template de evidências equivalente adaptado para POST).
6. **Decisão RC-3** — Promover / Estender / Rollback. Só então avaliar
   3B.2 (segunda função POST, se existir candidato válido).

### Fase D — R5 (Reliability Score)

Só inicia após conclusão de todas as ondas de adoção planejadas
(mínimo: 3A.1, 3A.2 e uma iteração 3B com RC-3 encerrada em
"Promover"). Passos:

1. Congelar o inventário R4.5 na versão pós-adoção.
2. Executar o cálculo do R5 Score usando o inventário congelado e as
   métricas observadas nas RCs.
3. Publicar relatório R5. Nenhum recomputo enquanto novas ondas estão
   em curso.

---

## 4. O que permanece explicitamente fora de escopo

Durante RC-2, Wave 3B e RC-3 (só sai de escopo por decisão formal e
nova RFC):

- Adoção de **Circuit Breaker** em qualquer função de produção.
- Adoção massiva de **Idempotency-Key** fora dos candidatos aprovados
  na 3B.
- Retry em POSTs com side-effect externo **não desduplicável**
  (cobranças, e-mails, invocações irreversíveis de terceiros).
- Wrapping de handler completo em Retry.
- Migração em massa de edge functions.
- Alterações em `_shared/reliability/*`, wrappers `serve*` ou
  `composePipeline`.
- Recomputação ou publicação de qualquer Reliability Score antes da
  Fase D.

---

## 5. Sequência canônica consolidada

```
R1 / R1.5 / R2 / R3 / R3.1 / R4-prep           ✅
Wave 1 (wrappers)                              ✅
Wave 2 (staging equivalence)                   ✅
Wave 3A.1 validate-build-pipeline              ✅
   └─ RC-1 observation                         ✅ closed
Wave 3A.2 scan-virus                           ✅ shipped
   └─ RC-2 validation gate                     🟡 ACTIVE (Hold)  ← estamos aqui
       ├─ Hardening (bug fixing P0/P1)         (em curso)
       ├─ RC-2.1 Synthetic Validation          (planejada)
       ├─ Commercial Readiness Gate            (OPEN)
       ├─ Primeiro tenant piloto               (bloqueado)
       └─ Fase B: encerramento + decisão       (pendente workload real)
Wave 3B POST idempotente                       🔒 checklist frozen
   └─ RC-3 observation                         🔒 pendente
R5 Reliability Score                           🔒 spec-only
```

---

## 6. Próxima ação imediata

Nenhuma alteração de runtime. Trabalho concentrado em três frentes
paralelas, todas fora de `_shared/reliability/*` e wrappers:

1. **Hardening** — fechar bugs P0/P1 conhecidos.
2. **RC-2.1 Synthetic Validation** — executar a suíte descrita em
   `rc-2-1-synthetic-validation-plan.md`.
3. **Commercial Readiness Gate** — preencher evidências em
   `commercial-readiness-gate.md`.

O closer da RC-2 (`scripts/reliability-rc2-close.ts`) permanece
disponível e emite `Hold` automaticamente enquanto o volume for
insuficiente. Nenhuma decisão `Promote` é admissível antes de
workload real.

