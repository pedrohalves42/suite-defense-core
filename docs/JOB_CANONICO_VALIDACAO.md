# ✅ Guia de Validação Canônica de Jobs – CyberShield

## Objetivo

Este guia valida se todo o pipeline de jobs está funcionando corretamente:

**Agente** ⇄ **HMAC** ⇄ **poll-jobs** ⇄ **execução** ⇄ **submit-job-result** ⇄ **banco**

São realizados **dois testes canônicos**:
1. **Job de sucesso**: `integration_test`
2. **Job de falha controlada**: `tipo_inexistente_xpto`

---

## 📋 Pré-requisitos

Antes de começar, certifique-se de que você tem:

- [ ] Pelo menos **1 agente v3 ativo** (heartbeat < 5min)
- [ ] Acesso ao **Supabase SQL Editor**
- [ ] Acesso aos **logs do agente**:
  - Windows: `C:\CyberShield\logs\cybershield-agent-v3.log`
  - Linux/macOS: `/var/log/cybershield/cybershield-agent-v3.log`
- [ ] Conhecer o `tenant_id` e `agent_name` do agente de teste

---

## 1️⃣ Job de Sucesso – `integration_test`

### 1.1. Escolher um agente saudável

No **Supabase SQL Editor**, execute:

```sql
SELECT 
  id,
  agent_name,
  tenant_id,
  last_heartbeat,
  status
FROM agents
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
ORDER BY last_heartbeat DESC
LIMIT 5;
```

**Escolha um agente com:**
- `last_heartbeat` recente
- `status` aceitável (ex: `active` ou `pending` mas com heartbeat ativo)

**Anote:**
- `TENANT_ID_TESTE`
- `AGENT_NAME_TESTE` (ex: `testefinal42`)

---

### 1.2. Criar o job canônico de sucesso

```sql
INSERT INTO public.jobs (
  tenant_id,
  agent_name,
  type,
  payload,
  status,
  created_at
) VALUES (
  'TENANT_ID_TESTE',          -- 🔁 substitua pelo tenant_id real
  'AGENT_NAME_TESTE',         -- 🔁 substitua pelo agent_name real
  'integration_test',         -- tipo suportado pelo agente v3
  '{}'::jsonb,                -- payload vazio para esse teste
  'queued',
  NOW()
)
RETURNING id, tenant_id, agent_name, type, status, created_at;
```

**Anote o `id` retornado** → `JOB_ID_TESTE`

---

### 1.3. Acompanhar a vida do job

Execute esta query **a cada 10–20 segundos**:

```sql
SELECT 
  id,
  type,
  status,
  created_at,
  delivered_at,
  started_at,
  finished_at,
  execution_time_seconds,
  (output IS NOT NULL)        AS has_output,
  (error_message IS NOT NULL) AS has_error,
  LEFT(output::text, 300)     AS output_preview,
  error_message
FROM public.jobs
WHERE id = 'JOB_ID_TESTE';
```

---

### 1.4. Lógica esperada do agente v3

No script PowerShell do agente v3, a execução do job `integration_test` deve ser algo como:

```powershell
"integration_test" {
    $output = @{
        message   = "Integration test OK"
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        agent     = $Global:AgentName
    }
}
```

Portanto, o campo `output` na tabela `jobs` deve ficar parecido com:

```json
{
  "message": "Integration test OK",
  "timestamp": "2025-11-16T21:59:12.3456789Z",
  "agent": "AGENT_NAME_TESTE"
}
```

---

### 1.5. Estado FINAL esperado no banco

Após o job ser executado com sucesso, o registro no banco deve estar similar a:

```
id                       = JOB_ID_TESTE
type                     = integration_test
status                   = completed
created_at               = 2025-11-16 21:59:10
delivered_at             = 2025-11-16 21:59:12
started_at               = 2025-11-16 21:59:12
finished_at              = 2025-11-16 21:59:13
execution_time_seconds   = 1
has_output               = true
has_error                = false
output_preview           = {"message":"Integration test OK","timestamp":"2025-11-16T21:59:12.34Z","agent":"AGENT_NAME_TESTE"}
error_message            = NULL
```

**Se você ver algo próximo disso, significa:**
- ✅ `poll-jobs` está autenticando e entregando o job
- ✅ O agente está executando o job corretamente
- ✅ `submit-job-result` (ou `ack-job`) está autenticando e salvando o resultado
- ✅ O schema de `jobs` está alinhado com os agentes

👉 **Esse é o "canário na mina"**. Se isso funciona, o pipeline está operacional.

---

### 1.6. Timeouts Esperados

| Transição | Tempo Esperado | Status se Exceder |
|-----------|----------------|-------------------|
| `queued` → `delivered` | < 60s | 🔴 Agente offline ou 401 em poll-jobs |
| `delivered` → `completed` | < 30s | 🟠 Erro na execução ou 401 em submit-job-result |
| **Total esperado** | **< 2 minutos** | 🔴 Investigar logs completos |

---

## 2️⃣ Job de Falha Canônica – tipo inválido

Agora vamos validar o **caminho de erro**.

### 2.1. Criar job com tipo inexistente

```sql
INSERT INTO public.jobs (
  tenant_id,
  agent_name,
  type,
  payload,
  status,
  created_at
) VALUES (
  'TENANT_ID_TESTE',              -- mesmo tenant
  'AGENT_NAME_TESTE',             -- mesmo agente
  'tipo_inexistente_xpto',        -- tipo que o agente NÃO conhece
  '{}'::jsonb,
  'queued',
  NOW()
)
RETURNING id;
```

**Anote o `id` retornado** → `JOB_ID_FAIL`

---

### 2.2. Acompanhar esse job

Execute a mesma query, trocando apenas o `id`:

```sql
SELECT 
  id,
  type,
  status,
  created_at,
  delivered_at,
  started_at,
  finished_at,
  execution_time_seconds,
  (output IS NOT NULL)        AS has_output,
  (error_message IS NOT NULL) AS has_error,
  LEFT(output::text, 300)     AS output_preview,
  error_message
FROM public.jobs
WHERE id = 'JOB_ID_FAIL';
```

---

### 2.3. Comportamento esperado do agente

No script v3, a execução deve incluir um bloco `default` que captura tipos desconhecidos:

```powershell
switch ($jobType) {
    "integration_test" {
        # ... execução do teste
    }
    "collect_info" {
        # ... coleta de informações
    }
    default {
        throw "Tipo de job não suportado: $jobType"
    }
}
```

E no bloco `catch`, o agente deve reportar a falha:

```powershell
Submit-JobResult `
    -JobId $jobId `
    -Status "failed" `
    -ErrorMessage $_.Exception.Message `
    -ExecutionTimeSeconds $execTime
```

---

### 2.4. Estado FINAL esperado no banco para o job de falha

```
id                       = JOB_ID_FAIL
type                     = tipo_inexistente_xpto
status                   = failed
created_at               = 2025-11-16 22:01:10
delivered_at             = 2025-11-16 22:01:12
started_at               = 2025-11-16 22:01:12
finished_at              = 2025-11-16 22:01:12
execution_time_seconds   = 0
has_output               = false
has_error                = true
output_preview           = NULL
error_message            = "Tipo de job não suportado: tipo_inexistente_xpto"
```

**Se isso acontecer:**
- ✅ Caminho de erro está funcionando
- ✅ O agente sabe reportar falha corretamente
- ✅ O backend aceita `status = failed` com `error_message`

---

## 3️⃣ Troubleshooting – Se o Job Travar

### 🔴 Job preso em `queued` (nunca sai desse estado)

**Significa:**
- O agente **não está rodando**, OU
- Está rodando mas **não consegue chamar `/poll-jobs`** (401, erro de HMAC, token errado, etc.)

**👉 Ação imediata:**

1. Verificar o log do agente:
   ```powershell
   # Windows
   Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 50
   ```

2. Procurar por:
   - `poll-jobs`
   - `StatusCode=401`
   - `Authentication failure`
   - `AgentToken: ...` / `HmacSecret: ...`

3. Conferir se o token e HMAC dos logs **batem** com os da tabela `agents` ou `enrollment_keys`

---

### 🟠 Job vai para `delivered`, mas nunca `completed`/`failed`

**Significa:**
- `poll-jobs` funciona (agente pega o job) ✅
- **Mas:**
  - O agente não executa (erro local), OU
  - Não consegue chamar `/submit-job-result` (401 / 500), OU
  - A função não está atualizando o status no banco

**👉 Ação:**

1. Ver o log do agente e procurar:
   - `Executando job`
   - `Enviando resultado do job`
   - `submit-job-result` ou `ack-job`
   - `StatusCode=401` / `StatusCode=500`

2. Ver os logs da Edge Function `submit-job-result` (ou `ack-job`) no Supabase Backend

---

## 📊 Matriz de Diagnóstico Rápido

| Sintoma | Causa Provável | Comando Diagnóstico | Ação |
|---------|----------------|---------------------|------|
| Job em `queued` >2min | Agente offline ou 401 em poll-jobs | `SELECT last_heartbeat FROM agents WHERE agent_name='X'` | Reiniciar agente / verificar credenciais |
| Job em `delivered` >5min | Erro na execução ou 401 em submit-job-result | Ver logs do agente + Edge Function | Corrigir script ou HMAC |
| `output` sempre NULL | `submit-job-result` não salva | Ver logs da Edge Function `submit-job-result` | Verificar RLS/permissions |
| `execution_time_seconds` NULL | Agente não envia esse campo | Atualizar script do agente v3 | Deploy do script corrigido |
| `error_message` NULL em job `failed` | Agente não envia `ErrorMessage` | Verificar função `Submit-JobResult` no script | Adicionar campo `ErrorMessage` |

---

## 📝 Logs de Referência

### Log CORRETO - Sucesso

```
[2025-11-16 22:05:12] [INFO] 📋 Recebido job ID: abc-123, tipo: integration_test
[2025-11-16 22:05:12] [INFO] ▶️  Executando job...
[2025-11-16 22:05:13] [INFO] ✅ Job concluído com sucesso
[2025-11-16 22:05:13] [DEBUG] 📤 Enviando resultado via submit-job-result
[2025-11-16 22:05:13] [INFO] ✅ Resultado enviado (StatusCode=200)
```

---

### Log CORRETO - Falha

```
[2025-11-16 22:06:15] [INFO] 📋 Recebido job ID: def-456, tipo: tipo_inexistente_xpto
[2025-11-16 22:06:15] [ERROR] ❌ Tipo de job não suportado: tipo_inexistente_xpto
[2025-11-16 22:06:15] [DEBUG] 📤 Enviando resultado de falha via submit-job-result
[2025-11-16 22:06:15] [INFO] ✅ Resultado de falha enviado (StatusCode=200)
```

---

### Onde Ver Logs das Edge Functions

1. Acesse: **Backend** → **Edge Functions** → `submit-job-result` → **Logs**
2. Filtrar por timestamp correspondente ao job
3. Procurar por:
   - `job_id`
   - `status update`
   - `SQL errors`
   - `Authentication errors`

---

## ✅ Checklist P0 Oficial

Use este checklist como protocolo oficial de validação:

### Pré-validação
- [ ] Agente v3 ativo (heartbeat < 5min)
- [ ] Credenciais validadas (AgentToken + HmacSecret)
- [ ] Sem erros 401 nos logs recentes

### Teste 1: integration_test
- [ ] Job criado com status `queued`
- [ ] Transição: `queued` → `delivered` (< 60s)
- [ ] Transição: `delivered` → `completed` (< 30s)
- [ ] Campo `output` preenchido com JSON válido
- [ ] Campos `started_at`, `finished_at`, `execution_time_seconds` preenchidos
- [ ] Campo `error_message` = NULL

### Teste 2: tipo_inexistente_xpto
- [ ] Job criado com status `queued`
- [ ] Transição: `queued` → `delivered` → `failed`
- [ ] Campo `error_message` contém "Tipo de job não suportado"
- [ ] Campo `output` = NULL ou vazio
- [ ] Campo `finished_at` preenchido

### Veredito Final

**Se todos os itens acima forem ✅:**
- ✅ **GO**: Pipeline operacional, pode avançar para P1/P2

**Se algum item falhou ou travou:**
- ❌ **NO-GO**: Revisar HMAC, credenciais, scripts do agente v3

---

## 📄 Template de Relatório de Validação

Use este template para documentar os resultados:

```markdown
# Relatório de Validação - Pipeline de Jobs

**Data:** YYYY-MM-DD  
**Executor:** Nome  
**Ambiente:** Produção / Staging / Dev  
**Agente Testado:** `agent_name`  
**Tenant ID:** `tenant_id`

---

## Teste 1: integration_test

**Job ID:** `job_id_teste`

| Campo | Valor Esperado | Valor Obtido | Status |
|-------|----------------|--------------|--------|
| status | `completed` | | ✅ / ❌ |
| has_output | `true` | | ✅ / ❌ |
| has_error | `false` | | ✅ / ❌ |
| execution_time_seconds | `> 0` | | ✅ / ❌ |
| Tempo total | `< 2min` | | ✅ / ❌ |

**Output obtido:**
```json
// Cole aqui o JSON do campo output
```

**Observações:**
- (adicione aqui qualquer observação relevante)

---

## Teste 2: tipo_inexistente_xpto

**Job ID:** `job_id_fail`

| Campo | Valor Esperado | Valor Obtido | Status |
|-------|----------------|--------------|--------|
| status | `failed` | | ✅ / ❌ |
| has_output | `false` | | ✅ / ❌ |
| has_error | `true` | | ✅ / ❌ |
| error_message | "Tipo de job não suportado" | | ✅ / ❌ |

**Error message obtido:**
```
// Cole aqui o conteúdo do campo error_message
```

**Observações:**
- (adicione aqui qualquer observação relevante)

---

## Veredito

- [ ] ✅ **GO** - Todos os testes passaram
- [ ] ❌ **NO-GO** - Algum teste falhou

**Próximos passos:**
- (descreva as ações necessárias)

---

## Logs do Agente

**Período analisado:** HH:MM - HH:MM

```
// Cole aqui trechos relevantes dos logs do agente
```

---

## Logs das Edge Functions

**Função:** submit-job-result  
**Período:** HH:MM - HH:MM

```
// Cole aqui trechos relevantes dos logs da Edge Function
```

---

**Assinatura:**  
Nome do executor: _______________  
Data: _______________
```

---

## 🔄 Uso como Runbook

### Integração em CI/CD

Este guia pode ser adaptado para testes automatizados:

1. **Script de validação automatizado:**
   - Criar job via API
   - Polling do status a cada 10s
   - Timeout de 5min
   - Assert nos campos esperados

2. **Alertas de monitoramento:**
   - Executar job `integration_test` a cada 15min
   - Alertar se tempo > 2min ou status ≠ `completed`

3. **Health check de deployment:**
   - Após deploy de nova versão do agente
   - Executar ambos os jobs canônicos
   - Só marcar deploy como "sucesso" se ambos passarem

### Adaptação para Ambientes

| Ambiente | Frequência | Ação em Falha |
|----------|-----------|---------------|
| **Produção** | A cada 15min | Alert crítico + página no-call |
| **Staging** | A cada 1h | Email para equipe de QA |
| **Dev** | Manual (antes de PR) | Bloquear merge |

---

## 📚 Referências

- **HMAC Specification:** `docs/HMAC_SPECIFICATION.md`
- **Agent V3 Upgrade Guide:** `docs/AGENT_V3_UPGRADE_GUIDE.md`
- **P0 Validation Results:** `docs/P0_VALIDATION_RESULTS.md`
- **Troubleshooting Guide:** `docs/TROUBLESHOOTING_GUIDE.md`

---

## 🎯 Benefícios Deste Documento

1. ✅ **Protocolo oficial reproduzível**
2. ✅ **Cobertura de caminho feliz + erro**
3. ✅ **Troubleshooting integrado**
4. ✅ **Template de relatório padronizado**
5. ✅ **Base para automação futura**

---

## 📌 Próximos Passos Após Validação

**Se GO (todos os testes passaram):**
1. Documentar resultados no template fornecido
2. Atualizar `docs/P0_VALIDATION_RESULTS.md` com veredito final
3. Avançar para validações P1:
   - HMAC detalhado
   - RLS policies
   - Métricas de performance

**Se NO-GO (algum teste falhou):**
1. Usar matriz de diagnóstico para identificar causa-raiz
2. Corrigir o problema identificado
3. Re-executar todo o protocolo
4. Documentar a correção no relatório

---

**Última atualização:** 2025-11-16  
**Versão:** 1.0  
**Autor:** CyberShield Team
