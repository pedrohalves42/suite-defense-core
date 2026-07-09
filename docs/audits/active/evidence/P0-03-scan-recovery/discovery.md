# P0-03 — Recuperação de scan interrompido · Discovery Note (Sprint 0 · Day 3)

- Date: 2026-07-09
- Owner: Reliability Lead
- Mode: read-only inspection
- Depends on: P0-05

## Classificação

**Confirmed.**

`scan-virus` e `scan-vulnerabilities` implementam retry para lookups
externos (VirusTotal / Hybrid Analysis), mas **não há mecanismo de
checkpoint/resume** para um scan interrompido a meio-caminho — se a
função morre entre o hash lookup e a persistência final, o scan é
perdido e precisa ser refeito do zero.

## Evidência coletada

### Retry externo (existe)

`supabase/functions/scan-virus/index.ts`:

- `withRetry(...)` envelopa `lookupGet` (linhas 48-63) com política
  conservadora (`LOOKUP_RETRY`).
- Respeita `retry-after` header (linhas 51-53).
- Consome body antes do retry para liberar stream Deno (comentário
  linha 55).
- Retry classifica só transientes (comentário linha 36).

### Recovery de scan (ausente)

- `rg -i "resume|recover|checkpoint"` em `scan-virus/` e
  `scan-vulnerabilities/`: **apenas hits para retry externo**, nenhum
  para persistência intermediária ou retomada.
- Não há tabela `scan_checkpoints` ou coluna `scan_progress` visível.
- Não há runbook `RUNBOOK-SCAN-RECOVERY.md` em `docs/runbooks/`.

## Sinais numéricos

| Sinal                                             | Valor |
| ------------------------------------------------- | ----- |
| Edge functions de scan                            | 2 (virus + vulns) |
| `withRetry` em lookups externos                   | sim   |
| Checkpoint intermediário de scan                  | não   |
| Resume automático de scan interrompido            | não   |
| Runbook de recovery                               | 0     |

## Guarda de freeze respeitada

- ❌ Nenhuma edge function de scan tocada.
- ❌ Nenhum wrapper/retry alterado.
- ❌ Nenhuma tabela criada.
- ✅ Apenas leitura de código e grep.

## Próximo passo (fora do Sprint 0)

1. Definir contrato de checkpoint: unidade mínima retomável
   (por arquivo, por host, por batch de hashes).
2. Persistir progresso em tabela dedicada com idempotency-key
   (herda P0-05).
3. Runbook de recovery + drill de scan interrompido.
4. Evidência DEPOIS: matar scan a 50%, retomar, comparar resultado
   final com scan single-shot.

Dependência: P0-05 (checkpoint precisa de idempotency para não
duplicar findings ao retomar).
