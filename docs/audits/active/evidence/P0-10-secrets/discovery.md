# P0-10 — Segredos em logs · Discovery Note (Sprint 0 · Day 1)

- Date: 2026-07-08
- Owner: Security Lead
- Mode: read-only inspection

## Perguntas guiadas

1. **Existe hoje?** Controle: logger estruturado em uso amplo. Restrição
   "no `console.log` em edge functions" está no `mem://index.md` Core.
2. **Como sei?**
   - `rg` por `console.(log|info|debug|warn|error)` combinado com padrões
     de segredo (`service_role`, `SERVICE_ROLE`, `Bearer `, `sk_`,
     `process.env`, `Deno.env`) em `supabase/functions/` retornou **0 hits**.
   - `rg -l "createLogger|structured-logger|_shared/logger"` retornou
     **214 arquivos** referenciando o logger estruturado, contra 75
     diretórios de edge functions — cobertura ampla.
3. **Reproduz?** Não neste sprint. Prova definitiva requer grep em
   **24h de logs de runtime** (não código-fonte).
4. **Custo real?** Muito baixo se a amostra de 24h confirmar o
   comportamento observado no código.

## Sinais coletados

- Static grep em edge functions:
  ```
  rg -n -E "console\\.(log|info|debug|warn|error)\\(.*(service_role|SERVICE_ROLE|Bearer |sk_[a-z]|process\\.env|Deno\\.env)" supabase/functions
  ```
  Resultado: **0 hits**.
- Presença de logger estruturado: **214** referências.
- Total de diretórios de edge functions: **75**.

## Classificação Discovery

**False Positive (pendente evidência formal de 24h de logs).**

Justificativa: o código-fonte não contém padrões de vazamento de
segredo via `console.*`. O controle preventivo (logger estruturado)
está amplamente adotado. Falta apenas a **evidência DEPOIS** exigida
pelo tracking board — o grep no dump de 24h de logs de produção
sintética.

## Próxima ação

- Rodar `rg` no dump de logs quando RC-2.1 gerar tráfego sintético.
- Adicionar step em CI: falhar build se aparecerem padrões proibidos
  em `console.*` (rule de linter local).
- Se o grep de 24h também retornar 0 hits → fechar direto como
  `Closed / False Positive`.

## Restrições respeitadas

- Nenhum código tocado.
- Nenhuma leitura de segredos em ambiente.

## Referências

- Core Rule: "No `console.log` em edge functions (use structured logger)".
- `hardening-tracking-board.md` linha P0-10.
