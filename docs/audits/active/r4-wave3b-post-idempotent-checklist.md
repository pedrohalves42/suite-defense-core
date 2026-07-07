# R4 Wave 3B — POST idempotente / Retry controlado (pre-approval)

Date: 2026-07-07
Status: **frozen — do not implement under RC-2**

Este checklist é congelado *antes* da implementação para que, quando a
janela de observação RC-2 fechar com evidências favoráveis, a Wave 3B
seja execução mecânica e não uma re-discussão de escopo.

## Preconditions (todas devem ser verdadeiras antes de iniciar)

- [ ] RC-2 (`scan-virus`) encerrada com relatório de evidências
      aprovado (`reliability-rc2-evidence-report.md`, decisão
      "Promover").
- [ ] Inventário R4.5 reporta exatamente 2 funções com Retry no
      momento em que a 3B inicia (sem drift).
- [ ] Nenhum incidente aberto tocando `_shared/reliability/*`,
      wrappers `serve*` ou as funções candidatas.
- [ ] Especificação do mecanismo de Idempotency-Key (R3-D)
      formalmente aprovada — Wave 3B **depende** de idempotência
      explícita em POST.

## Princípio de escopo

Wave 3B introduz Retry em **POSTs idempotentes por design ou por
Idempotency-Key**. Não introduz Retry em qualquer POST arbitrário.

Um POST é elegível se e somente se:
1. Sua semântica é naturalmente idempotente (upsert por chave natural,
   PUT-like semântico), **OU**
2. O endpoint aceita e honra `Idempotency-Key`, com deduplicação
   server-side persistida.

POSTs que criam side-effects externos não desduplicáveis
(cobranças, envios de e-mail, invocações irreversíveis de terceiros)
são **inelegíveis** e permanecem fora do escopo.

## Candidatos avaliados (pré-triagem, sem seleção final)

Seleção definitiva ocorre no início da Wave 3B com base em evidências
RC-2 e reavaliação da tabela de idempotência.

| Função | Wrapper | Motivo de avaliação | Elegível? |
| --- | --- | --- | --- |
| `ai-router` | serveTenant | Roteia calls para AI Gateway (upstream idempotente por request-id) | A confirmar |
| `ops-gateway` | servePublic | Fan-out de operações; alguns paths são upsert | A confirmar |
| `submit-hmac-router` | serveAgent | Submissão de resultado com dedup key existente | A confirmar |
| `submit-job-result` | serveAgent | Dedup por job_id | A confirmar |

Nenhum outro candidato é considerado nesta wave.

## Escopo mínimo (execução real)

- [ ] Selecionar **exatamente 1** função candidata para 3B.1.
- [ ] Aplicar Retry **apenas** à chamada externa upstream, nunca ao
      handler completo.
- [ ] Persistência (writes locais, RPCs, invokes) permanece **fora**
      do envelope de retry.
- [ ] Se a dedup depende de Idempotency-Key, o key MUST ser gerado ou
      propagado antes da primeira tentativa e reutilizado em todas.

## Per-call checklist (aplicar a cada chamada retentada)

- [ ] Chamada é POST documentado como idempotente (semântica natural
      ou Idempotency-Key honrada pelo servidor).
- [ ] `fetchWithTimeout` preservado como timeout por tentativa.
- [ ] `withRetry` com `idempotent: true` **somente** quando a chamada
      atende a definição acima; caso contrário `idempotent: false` e
      Retry não dispara.
- [ ] `method: 'POST'` explicitamente informado ao classifier.
- [ ] Status retentáveis: 408, 425, 429, 5xx (exceto 501). `Retry-After`
      parseado.
- [ ] Status não-retentáveis (400, 401, 403, 404, 409, 422, 501)
      retornam ao handler sem alteração.
- [ ] Nenhum novo nome de evento além de `RELIABILITY_EVENTS`.
- [ ] Contrato HTTP, headers e status codes inalterados.

## Invariantes de persistência

- [ ] Nenhum write local duplicado entre tentativas.
- [ ] Em exaustão de retry, persistência é pulada e erro original é
      propagado; nenhum estado parcial gravado.
- [ ] Dedup keys existentes preservadas.
- [ ] Se Idempotency-Key server-side é usado, resposta em 2ª tentativa
      é aceita como sucesso equivalente (não gera reprocessamento
      local).

## Telemetria

- [ ] `reliability.retry.attempt` observado em staging antes de
      promover a produção.
- [ ] `reliability.retry.exhausted` correlacionado com causa
      transiente.
- [ ] `requestId` / `traceId` / Idempotency-Key preservados em todas
      as tentativas.
- [ ] Nenhum PII adicionado a labels/eventos.

## Rollback

- [ ] Reverter o diff da função selecionada restaura comportamento
      anterior exatamente.
- [ ] Sem dependência de schema, dado ou configuração.
- [ ] R4.5 scanner retorna a 2 funções com Retry após rollback.

## Explicit non-goals (permanecem deferred após 3B)

- Adoção de Circuit Breaker em qualquer lugar.
- Adoção massiva de Idempotency-Key em POSTs não candidatos.
- Retry em POSTs de side-effect externo não desduplicável.
- Wrapping de handler completo.
- Migração em massa de edge functions.
- Cálculo de qualquer R5 Score.

## Exit criteria da Wave 3B

- Janela de observação **RC-3** aberta após ship de 3B.1.
- Relatório de evidências equivalente ao da RC-2, adaptado para POST.
- Decisão explícita antes de 3B.2 (segunda função POST, se houver).
