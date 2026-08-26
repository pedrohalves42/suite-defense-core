# P0-05 / P0-03 — Prova de deduplicação e chave de idempotência de scan

## Bloqueio imediato

O banco hospedado está **pausado** agora. Toda consulta retorna timeout de conexão. Nada dos Passos 1–3 pode rodar até você reativar o backend nas configurações do projeto (Cloud). Assim que estiver ativo, a sequência abaixo é executada na ordem.

## O que já está confirmado por leitura do repositório (sem banco)

Do arquivo de baseline `supabase/migrations/20260426000000_baseline.sql`:

- `idx_jobs_dedup_active` — `UNIQUE (agent_id, type) WHERE status IN ('pending','queued','delivered')` (linha 46301).
- `idx_exec_log_idempotency` — `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL` em `automation_execution_log` (linha 45328).
- `job_executions_job_id_nonce_key` — `UNIQUE (job_id, nonce)` (linha 38512).
- `public.virus_scans` **não tem** a coluna `scan_key` hoje (definição na linha 34944).

Ou seja, o resultado esperado do Passo 1 já bate com o schema versionado; a execução no banco serve como confirmação de que o ambiente real não sofreu drift.

## Correção necessária no SQL do Passo 2

A tabela `jobs` usa a coluna **`type`**, não `job_type` — o índice de dedup é sobre `(agent_id, type)`. O INSERT como está escrito falharia por coluna inexistente, e não por violação de unicidade, o que daria uma falsa prova. O probe será executado com `type`.

## Execução proposta

### Passo 1 — Inventário de constraints (somente leitura)
Rodar as duas consultas de catálogo exatamente como enviadas e colar o output completo no chat.

### Passo 2 — Contagem de duplicidade ativa (somente leitura)
Rodar a contagem de `agent_id, type` com status ativo e reportar o número de linhas (esperado: 0).

### Passo 2b — Prova funcional do dedup em `jobs`
A ferramenta de leitura não executa INSERT, e a ferramenta de escrita não permite `BEGIN/ROLLBACK` — cada comando confirma sozinho. O padrão equivalente, sem sujar dados, é:

1. Inserir uma linha-sonda em `jobs` (`type = 'service_health_check'`, `status = 'pending'`, agente e tenant reais).
2. Repetir o mesmo INSERT — o esperado é o erro `duplicate key value violates unique constraint "idx_jobs_dedup_active"`, que é a evidência.
3. `DELETE` da linha-sonda pelo `id`, restaurando o estado.

O output bruto dos três passos, incluindo o texto do erro, vai para a evidência.

### Passo 3 — P0-03: `virus_scans.scan_key`
Mudança de schema, portanto entra como migração para sua aprovação (não como comando avulso):

```sql
ALTER TABLE public.virus_scans ADD COLUMN IF NOT EXISTS scan_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_virus_scans_scan_key
  ON public.virus_scans (scan_key) WHERE scan_key IS NOT NULL;
COMMENT ON COLUMN public.virus_scans.scan_key IS
  'P0-03 idempotency key: tenant_id:file_hash:UTC-date. NULL for legacy rows.';
```

Depois de aplicada, o mesmo padrão de sonda do Passo 2b em `virus_scans` (inserir, repetir esperando `uq_virus_scans_scan_key`, apagar a sonda).

Observação de escopo: esta migração apenas cria a coluna e o índice. Fazer as edge functions de scan **gravarem** `scan_key` é mudança de runtime e continua sob o congelamento pré-produção — fica como item seguinte, separado.

### Passo 4 — Registro da evidência
Consolidar os outputs em:

- `docs/audits/active/evidence/P0-05-idempotency/dedup-proof.md`
- `docs/audits/active/evidence/P0-03-scan-recovery/scan-key-proof.md`

e atualizar o quadro de rastreamento com a nova classificação de P0-05 e P0-03.

## Confirmação que preciso de você

- Reative o backend pausado; sem isso nada roda.
- Confirme que aceita as sondas com INSERT + DELETE imediato em `jobs` e `virus_scans` (não há como usar `ROLLBACK` por aqui). Se preferir zero escrita em produção, faço apenas os Passos 1 e 2 (somente leitura) e a prova funcional fica pendente.
