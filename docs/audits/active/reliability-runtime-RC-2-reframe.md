# Reliability Runtime — RC-2 REFRAME (validation gate)

Date: 2026-07-07
Status: **RC-2 reframed** — pre-production Validation Gate

Este documento **substitui a interpretação anterior** de RC-2 como
"observação pós-produção". O sistema não recebe tráfego comercial
ainda, portanto a janela atual não pode validar carga real.

RC-2 permanece **ACTIVE**, mas com objetivo redefinido:

```
Antes: RC-2 = observação pós-produção
Agora: RC-2 = pré-produção controlada + readiness validation
```

O runtime segue **frozen**. Todos os invariantes de
`reliability-runtime-RC-2.md` continuam válidos. O que muda é a
**natureza do gate de saída**.

---

## Nova saída da RC-2

Além das três decisões originais, adiciona-se **Hold**:

| Decisão | Quando aplicar |
| --- | --- |
| ✅ Promote | Todos os gates E1–E6 ✅ **E** houve volume real representativo. |
| ⏸️ Extend | Algum gate ⏳ mas sem sinal de regressão. |
| ❌ Rollback | Qualquer gate crítico ❌ (duplicatas, classifier bug, incidente high/critical). |
| 🛠️ Hold — hardening required | Gates ✅ **mas** volume insuficiente (heurística `< 50 scans`) ou readiness pré-comercial incompleta. |

**Decisão atual esperada: Hold**, até que:

1. Bugs P0/P1 conhecidos estejam fechados;
2. Fase RC-2.1 Synthetic Validation esteja completa;
3. Commercial Readiness Gate esteja verde (ver
   `commercial-readiness-gate.md`);
4. Um tenant piloto real tenha gerado tráfego representativo.

---

## Nova fase intermediária: RC-2.1 Synthetic Validation

Antes do primeiro cliente, executar carga sintética controlada:

- Tenants de teste (mínimo 2, isolados).
- Agentes simulados por SO (Windows, Linux, macOS).
- Arquivos conhecidos (limpo, EICAR, hashes conhecidos VT/HA).
- Cenários provocados: sucesso, timeout, 429, 500, agente offline,
  update falhando.

Objetivo: exercitar o envelope de Retry de `scan-virus` em condições
representativas, sem depender de tráfego externo real.

Registro: cada execução gera checkpoint no
`reliability-rc2-evidence-report.md` marcado com prefixo
`SYNTHETIC-`, para separar de evidência de carga real.

---

## Automação — impacto

O closer (`scripts/reliability-rc2-close.ts`) agora reconhece o cenário
"synthetic only" via heurística de volume e emite `Hold` como
recomendação em vez de `Promote`. A assinatura humana no bloco
"Decisão final" permanece a única autoridade.

---

## O que permanece bloqueado

Sem alteração:

- Wave 3B (POST idempotente / retry controlado).
- R5 Reliability Score.
- Adoção adicional de Retry, Breaker ou Idempotency.
- Alterações em `_shared/reliability/*`, wrappers `serve*`,
  `composePipeline`.

Motivo do bloqueio, agora explícito: **aumentar superfície de mudança
antes de estabilizar o core não é aceitável em pré-produção**.
