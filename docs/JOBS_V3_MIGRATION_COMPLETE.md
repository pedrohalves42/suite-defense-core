# Jobs v3 - Migração Completa ✅

**Status**: ✅ **CONCLUÍDO**  
**Data**: 2025-01-18  
**Versão**: v3.0.0

---

## 📋 Resumo Executivo

Sistema migrado de **Jobs v1** (ack-job, status='done') para **Jobs v3** (submit-job-result, status='completed'/'failed' com output estruturado).

### Componentes Migrados

✅ **Backend (Supabase)**
- Colunas `output`, `error_message`, `started_at`, `finished_at`, `execution_time_seconds`
- View `jobs_normalized` com flag `is_v3` e campo `duration_seconds` calculado
- Edge Function `submit-job-result` com validação HMAC + rate limiting

✅ **Agentes**
- Windows PowerShell v3 (`cybershield-agent-windows-v3.ps1`)
- Linux Bash v3 (`cybershield-agent-linux-v3.sh`)
- macOS Bash v3 (`cybershield-agent-macos-v3.sh`)

✅ **Dashboard**
- Página `/admin/jobs-v3-migration` monitora adoção
- Query otimizada para exibir jobs v1 + v3

---

## 🔄 Diferenças v1 vs v3

### Jobs v1 (Legado - ack-job)
- **Endpoint**: `/functions/v1/ack-job`
- **Status final**: `done`
- **Campos preenchidos**: Apenas `status`, `completed_at`
- **Output**: Não existe (NULL)
- **Detalhes de execução**: Não rastreados

### Jobs v3 (Atual - submit-job-result)
- **Endpoint**: `/functions/v1/submit-job-result`
- **Status final**: `completed` ou `failed`
- **Campos preenchidos**: 
  - `status`
  - `output` (JSON estruturado)
  - `error_message`
  - `started_at`
  - `finished_at`
  - `execution_time_seconds`
- **Output**: Estruturado (JSON com detalhes da execução)
- **Detalhes de execução**: Completos e rastreáveis

---

## 🛠 Detalhes Técnicos

### Banco de Dados

**Colunas adicionadas à tabela `jobs`:**
```sql
- output: jsonb  -- Resultado estruturado do job
- error_message: text  -- Mensagem de erro (se houver)
- started_at: timestamptz  -- Timestamp de início
- finished_at: timestamptz  -- Timestamp de conclusão (substitui completed_at)
- execution_time_seconds: integer  -- Duração em segundos
```

**View `jobs_normalized`:**
```sql
-- Mapeia status='done' → normalized_status='completed'
-- Flag is_v3 = (output IS NOT NULL)
-- Campo duration_seconds calculado automaticamente
SELECT 
  *,
  CASE WHEN status = 'done' THEN 'completed' ELSE status END AS normalized_status,
  (output IS NOT NULL) AS is_v3,
  COALESCE(
    execution_time_seconds,
    EXTRACT(EPOCH FROM (finished_at - started_at))::integer
  ) AS duration_seconds
FROM jobs;
```

### Edge Function `submit-job-result`

**Payload esperado:**
```json
{
  "job_id": "uuid",
  "status": "completed" | "failed",
  "output": { /* objeto estruturado */ },
  "error_message": "string opcional",
  "execution_time_seconds": 123,
  "started_at": "2025-01-18T12:00:00Z",  // opcional
  "finished_at": "2025-01-18T12:02:03Z"  // opcional
}
```

**Validações:**
- ✅ Autenticação via `X-Agent-Token`
- ✅ HMAC obrigatório (assinatura + timestamp + nonce)
- ✅ Rate limiting (100 req/min por agente)
- ✅ Ownership do job (mesmo `agent_name` e `tenant_id`)
- ✅ Idempotência (jobs já `completed`/`failed` não são atualizados)

**Campos atualizados no banco:**
```typescript
{
  status: 'completed' | 'failed',
  finished_at: payload.finished_at || new Date().toISOString(),
  output: payload.output,
  error_message: payload.error_message,
  execution_time_seconds: payload.execution_time_seconds,
  started_at: payload.started_at,
  completed_at: finished_at  // Compatibilidade legado
}
```

### Agente PowerShell v3

**Função `Submit-JobResult`:**
```powershell
function Submit-JobResult {
    param(
        [string]$JobId,
        [bool]$Success,
        [object]$Output = $null,
        [string]$ErrorMessage = "",
        [int]$ExecutionTimeSeconds = 0,
        [datetime]$StartedAt = $null
    )

    $body = @{
        job_id = $JobId
        status = if ($Success) { "completed" } else { "failed" }
        output = $Output
        error_message = if ($ErrorMessage) { $ErrorMessage } else { $null }
        execution_time_seconds = $ExecutionTimeSeconds
    }

    if ($StartedAt) {
        $body.started_at = $StartedAt.ToUniversalTime().ToString("o")
    }

    Invoke-SecureRequest `
        -Uri "$ServerUrl/functions/v1/submit-job-result" `
        -Method "POST" `
        -Body $body `
        -TimeoutSec 30
}
```

**Integração em `Execute-Job`:**
```powershell
$startTime = Get-Date
try {
    # ... executa job ...
    $jobSuccess = $true
    $outputObject = @{ /* resultado */ }
} catch {
    $jobSuccess = $false
    $errorMessage = $_.Exception.Message
} finally {
    $endTime = Get-Date
    $durationSec = [int]($endTime - $startTime).TotalSeconds
}

Submit-JobResult `
    -JobId $jobId `
    -Success $jobSuccess `
    -Output $outputObject `
    -ErrorMessage $errorMessage `
    -ExecutionTimeSeconds $durationSec `
    -StartedAt $startTime
```

---

## 📊 Métricas de Adoção

### Query para acompanhar migração

```sql
-- Adoção geral (últimos 7 dias)
SELECT 
  COUNT(*) FILTER (WHERE is_v3 = true) as jobs_v3,
  COUNT(*) FILTER (WHERE is_v3 = false) as jobs_v1,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_v3 = true) / COUNT(*), 1) as percent_v3
FROM jobs_normalized
WHERE created_at > NOW() - INTERVAL '7 days';

-- Adoção por agente
SELECT 
  agent_name,
  COUNT(*) FILTER (WHERE is_v3 = true) as v3_jobs,
  COUNT(*) FILTER (WHERE is_v3 = false) as v1_jobs,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_v3 = true) / COUNT(*), 1) as percent_v3,
  MAX(last_heartbeat) as last_heartbeat
FROM jobs_normalized
JOIN agents ON agents.agent_name = jobs_normalized.agent_name
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY agent_name
ORDER BY percent_v3 DESC;
```

### Metas

- **Fase 2** (atual): >50% jobs usam v3 após 1 semana
- **Fase 3**: >80% jobs usam v3 após 3 semanas
- **Fase 4**: >95% jobs usam v3 → pronto para deprecar v1

---

## 🔄 Backward Compatibility

O sistema mantém compatibilidade total com agentes v1:

1. **Edge Function `ack-job` continua funcionando**
   - Jobs antigos podem usar `/functions/v1/ack-job/{job_id}`
   - Atualiza apenas `status='done'` e `completed_at`

2. **View `jobs_normalized` unifica ambos**
   - Mapeia `status='done'` → `normalized_status='completed'`
   - Flag `is_v3` diferencia jobs novos vs antigos
   - Dashboard lê de `jobs_normalized` (funciona para ambos)

3. **Agentes híbridos suportados**
   - Tentam v3 primeiro (`submit-job-result`)
   - Fallback para v1 (`ack-job`) se v3 falhar
   - Garante zero downtime durante rollout

---

## 🧪 Validação

### Teste de Jobs v3

```sql
-- 1. Criar job de teste
INSERT INTO jobs (agent_name, tenant_id, type, status, payload)
VALUES ('audit-agent', 'YOUR_TENANT_ID', 'integration_test', 'queued', '{}'::jsonb);

-- 2. Aguardar execução (até 60s)

-- 3. Validar resultado
SELECT 
  id,
  status,
  is_v3,
  output,
  execution_time_seconds,
  started_at,
  finished_at,
  duration_seconds
FROM jobs_normalized
WHERE agent_name = 'audit-agent'
ORDER BY created_at DESC
LIMIT 1;
```

**Critérios de sucesso:**
- ✅ `status = 'completed'`
- ✅ `is_v3 = true`
- ✅ `output` é JSON não-nulo
- ✅ `execution_time_seconds > 0`
- ✅ `finished_at IS NOT NULL`
- ✅ `duration_seconds > 0`

---

## 🚀 Rollout Strategy

### Fase 1: Backend Ready ✅
- Colunas v3 adicionadas ao banco
- Edge Function `submit-job-result` implementada
- Dashboard atualizado para aceitar v1 + v3

### Fase 2: Agente Híbrido 🔄
- Função `Submit-JobResult` adicionada ao agente PowerShell
- Fallback automático para v1 se v3 falhar
- Rollout controlado por agente (sem necessidade de sync global)

### Fase 3: Monitoramento 🔄
- Dashboard `/admin/jobs-v3-migration` monitora adoção
- Guardian `validate-system.ts` valida % de jobs v3
- Identificação de agentes ainda em v1

### Fase 4: Deprecação v1 (Futuro)
- Após >95% adoção de v3
- Remover Edge Function `ack-job`
- Considerar migração de coluna `completed_at` → `finished_at`

---

## 🛠 Troubleshooting

### Job não está sendo reportado como v3

**Sintomas:**
- Job tem `status='completed'` mas `is_v3=false`
- Campo `output` é NULL

**Causas:**
1. Agente ainda está usando `ack-job` (v1)
2. Payload do `submit-job-result` não inclui `output`
3. `output` está vazio (`{}` não conta, precisa ter dados)

**Solução:**
```powershell
# Garantir que Submit-JobResult envia output
$output = @{
    result = "Sucesso"
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    # ... outros campos ...
}

Submit-JobResult -JobId $id -Success $true -Output $output
```

### Job v3 com execution_time_seconds = 0

**Causa**: Agente não está medindo tempo de execução

**Solução:**
```powershell
$startTime = Get-Date
# ... executa job ...
$endTime = Get-Date
$durationSec = [int]($endTime - $startTime).TotalSeconds

Submit-JobResult -ExecutionTimeSeconds $durationSec
```

### Dashboard não mostra output estruturado

**Verificar:**
1. Query usa `jobs_normalized` (não `jobs` direto)
2. Componente verifica `is_v3` antes de renderizar output
3. Output é válido JSON (não string)

---

## 📚 Referências

- **Edge Function**: `supabase/functions/submit-job-result/index.ts`
- **View**: `public.jobs_normalized` (query em migration)
- **Agente**: `supabase/functions/_shared/agent-script-windows-content.ts`
- **Dashboard**: `src/pages/admin/JobsV3Migration.tsx`
- **Spec**: `docs/JOBS_V1_VS_V3.md`

---

## 🎯 Próximos Passos

1. **Monitorar adoção** (48h)
   - Verificar `/admin/jobs-v3-migration` diariamente
   - Meta: >50% v3 em 1 semana

2. **Atualizar agentes legados** (gradual)
   - Identificar agentes com % v3 < 50%
   - Atualizar script via `agent_releases` + auto-update

3. **Deprecar v1** (após >95% v3)
   - Remover `ack-job` edge function
   - Atualizar documentação oficial
   - Anunciar breaking change com 2 semanas de antecedência

---

## ✅ Critérios de Sucesso

- [x] Colunas v3 existem na tabela `jobs`
- [x] View `jobs_normalized` funciona para v1 + v3
- [x] Edge Function `submit-job-result` deployado
- [x] Agentes v3 enviam output estruturado
- [ ] >50% adoção v3 em 1 semana
- [ ] >80% adoção v3 em 3 semanas
- [ ] >95% adoção v3 → deprecar v1

---

**Documento vivo - atualizar conforme sistema evolui**
