# 🚨 Playbook de Resposta a Incidentes

## Índice
1. [Agente Stuck em Pending sem Heartbeat](#1-agente-stuck-em-pending-sem-heartbeat)
2. [Alta Taxa de Falha de Instalação (>30%)](#2-alta-taxa-de-falha-de-instalação-30)
3. [Jobs Acumulando em Queue (>50 jobs queued)](#3-jobs-acumulando-em-queue-50-jobs-queued)
4. [Jobs v3 Não Sendo Usado (100% v1)](#4-jobs-v3-não-sendo-usado-100-v1)
5. [Agente Gerando 401 Unauthorized](#5-agente-gerando-401-unauthorized)

---

## 1. Agente Stuck em Pending sem Heartbeat

### 🔴 Sintomas
- Status `pending` por mais de 10 minutos
- `last_heartbeat` IS NULL
- Enrollment key marcada como usada
- Não aparece no dashboard como ativo

### 🔍 Diagnóstico SQL
```sql
-- Identificar agentes stuck
SELECT 
  agent_name,
  status,
  enrolled_at,
  last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - enrolled_at))/60 AS minutes_stuck
FROM agents
WHERE status = 'pending' 
  AND last_heartbeat IS NULL
ORDER BY enrolled_at DESC;
```

### 🛠️ Passos de Ação

#### 1.1 Na VM onde o agente foi instalado:
```powershell
# Verificar Scheduled Task
Get-ScheduledTask -TaskName "CyberShieldAgent*" | Format-List TaskName, State, LastRunTime, LastTaskResult

# LastTaskResult = 0 → OK
# LastTaskResult = 267011 (0x41303) → Task não encontrou o arquivo
# LastTaskResult = 4294770688 (0xFFFD0020) → Argumentos mal-formados

# Verificar script do agente
Test-Path "C:\CyberShield\cybershield-agent-*.ps1"
Get-ChildItem "C:\CyberShield" -Recurse

# Verificar tamanho do script (deve ser > 50KB)
$script = Get-Item "C:\CyberShield\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue
if ($script) {
    Write-Host "Script size: $($script.Length) bytes" -ForegroundColor $(if ($script.Length -gt 50000) {'Green'} else {'Red'})
} else {
    Write-Host "❌ Script não encontrado!" -ForegroundColor Red
}
```

#### 1.2 Verificar logs de instalação:
```powershell
# Logs do instalador
Get-Content "C:\CyberShield\logs\installer.log" -Tail 100

# Procurar erros críticos
Select-String -Path "C:\CyberShield\logs\installer.log" -Pattern "ERRO|CRITICAL|throw"

# Logs do agente (se houver)
Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 100
```

#### 1.3 Verificar credenciais no banco:
```sql
-- Comparar credenciais do agente com o que está no script
SELECT 
  a.agent_name,
  a.hmac_secret,
  t.token,
  t.is_active
FROM agents a
LEFT JOIN agent_tokens t ON t.agent_id = a.id
WHERE a.agent_name = 'NOME_DO_AGENTE';
```

Abra o script na VM e compare:
```powershell
# Ver credenciais no script
Select-String -Path "C:\CyberShield\cybershield-agent-*.ps1" -Pattern "\$AgentToken|\$HmacSecret" | Select-Object -First 2
```

#### 1.4 Testar conectividade:
```powershell
# Testar /health endpoint
Invoke-WebRequest -Uri "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/health" -UseBasicParsing

# Resultado esperado: status 200
```

#### 1.5 Executar manualmente para debug:
```powershell
# Executar agente em modo interativo
cd C:\CyberShield
.\cybershield-agent-NOME.ps1 -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co" -AgentToken "TOKEN_DO_BANCO" -HmacSecret "HMAC_DO_BANCO" -AgentName "NOME" -PollInterval 60

# Ver output completo - deve mostrar heartbeat 200 OK
```

### ✅ Resolução

**Cenário A: Instalador falhou (script não existe ou muito pequeno)**
1. Limpar agente do banco (ver script de limpeza abaixo)
2. Limpar VM: `Remove-Item "C:\CyberShield" -Recurse -Force`
3. Gerar novo instalador no dashboard
4. Reinstalar como Administrador
5. Validar heartbeat em < 2 minutos

**Cenário B: Token/HMAC inválidos (401 nos logs)**
1. Ir para `/admin/agent-troubleshooting`
2. Regenerar credenciais do agente
3. Baixar novo instalador
4. Reinstalar

**Cenário C: Task criada mas argumentos errados (LastTaskResult ≠ 0)**
1. Verificar encoding do script (UTF-8 sem BOM)
2. Regenerar instalador (pode ter sido bug no serve-installer)
3. Reinstalar

### 🔧 Script de Limpeza de Agente
```sql
-- Limpar agente stuck do banco de dados
DO $$
DECLARE
  v_agent_id uuid;
BEGIN
  SELECT id INTO v_agent_id FROM agents WHERE agent_name = 'NOME_DO_AGENTE';
  
  IF v_agent_id IS NOT NULL THEN
    -- Limpar tokens
    DELETE FROM agent_tokens WHERE agent_id = v_agent_id;
    
    -- Limpar jobs
    DELETE FROM jobs WHERE agent_id = v_agent_id;
    
    -- Limpar métricas
    DELETE FROM agent_system_metrics WHERE agent_id = v_agent_id;
    
    -- Limpar analytics de instalação
    DELETE FROM installation_analytics WHERE agent_id = v_agent_id;
    
    -- Limpar enrollment keys
    DELETE FROM enrollment_keys WHERE used_by_agent = 'NOME_DO_AGENTE';
    
    -- Deletar agente
    DELETE FROM agents WHERE id = v_agent_id;
    
    RAISE NOTICE 'Agente "NOME_DO_AGENTE" limpo com sucesso';
  ELSE
    RAISE NOTICE 'Agente "NOME_DO_AGENTE" não encontrado';
  END IF;
END $$;
```

---

## 2. Alta Taxa de Falha de Instalação (>30%)

### 🔴 Sintomas
- Muitos eventos `installation_failed` em `installation_analytics`
- Alerta em `system_alerts`: `high_failure_rate`
- Dashboard `/admin/installation-health` mostra vermelho

### 🔍 Diagnóstico SQL
```sql
-- Taxa de falha nas últimas 24h
SELECT 
  event_type,
  success,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS percentage
FROM installation_analytics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type, success
ORDER BY event_type, success;

-- Ver erros mais comuns
SELECT 
  metadata->>'error_message' AS error,
  platform,
  COUNT(*) as count
FROM installation_analytics
WHERE success = false
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error, platform
ORDER BY count DESC
LIMIT 10;
```

### 🛠️ Possíveis Causas

| Erro | Causa | Solução |
|------|-------|---------|
| 401 Unauthorized | Token/HMAC inválido | Regenerar credenciais e reinstalar |
| Timeout | Firewall/proxy bloqueando | Liberar `*.supabase.co:443` |
| Script não criado | Encoding UTF-16 ou template truncado | Validar UTF-8 sem BOM no template |
| Task falha (4294770688) | Argumentos mal-formados | Revisar `installer-template.ts` |
| PowerShell syntax error | Incompatibilidade PowerShell 5.1 | Atualizar script do agente |

### ✅ Ações
1. Verificar logs de instalação nas VMs afetadas
2. Conferir encoding do script gerado (UTF-8 sem BOM)
3. Validar placeholders no instalador (`serve-installer` logs)
4. Se erro sistemático: atualizar template e regenerar instaladores
5. Comunicar usuários afetados para reinstalar

---

## 3. Jobs Acumulando em Queue (>50 jobs queued)

### 🔴 Sintomas
- Muitos jobs com `status = 'queued'` há >30 min
- Dashboard mostra fila crescendo continuamente
- Agentes online mas não processando

### 🔍 Diagnóstico SQL
```sql
-- Jobs queued por agente
SELECT 
  agent_name,
  COUNT(*) AS queued_jobs,
  MIN(created_at) AS oldest_job,
  MAX(created_at) AS newest_job,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))/60 AS oldest_job_age_minutes
FROM jobs
WHERE status = 'queued'
  AND created_at < NOW() - INTERVAL '30 minutes'
GROUP BY agent_name
ORDER BY queued_jobs DESC;

-- Verificar se agentes estão online
SELECT 
  a.agent_name,
  a.status,
  a.last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))/60 AS minutes_since_heartbeat,
  COUNT(j.id) AS queued_jobs
FROM agents a
LEFT JOIN jobs j ON j.agent_name = a.agent_name AND j.status = 'queued'
WHERE a.status = 'active'
GROUP BY a.agent_name, a.status, a.last_heartbeat
HAVING COUNT(j.id) > 0
ORDER BY queued_jobs DESC;
```

### 🛠️ Ações

#### 3.1 Se agente offline (last_heartbeat > 5 min):
1. Verificar VM/container está rodando
2. Verificar Scheduled Task: `Get-ScheduledTask -TaskName "CyberShieldAgent*"`
3. Reiniciar task: `Start-ScheduledTask -TaskName "CyberShieldAgent-NOME"`
4. Se necessário: reinstalar agente

#### 3.2 Se agente online mas não processando:
```powershell
# Verificar logs do agente
Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 200

# Procurar por:
# - "Polling jobs..." → poll-jobs está funcionando?
# - "Processing job..." → jobs estão sendo recebidos?
# - "ERROR" → há erros impedindo processamento?
```

#### 3.3 Se erro sistemático em submit-job-result:
1. Verificar logs do Edge Function `submit-job-result`
2. Validar HMAC signature
3. Validar formato do payload enviado pelo agente

#### 3.4 Limpeza de jobs antigos (>24h):
```sql
-- Cancelar jobs muito antigos que nunca serão processados
UPDATE jobs
SET status = 'cancelled',
    error_message = 'Job expired - queued for >24 hours'
WHERE status = 'queued'
  AND created_at < NOW() - INTERVAL '24 hours';
```

---

## 4. Jobs v3 Não Sendo Usado (100% v1)

### 🔴 Sintomas
- Dashboard `/admin/jobs-v3-migration` mostra 0% adoção
- Todos os jobs têm `output IS NULL`
- Função `Submit-JobResult` não está sendo chamada

### 🔍 Diagnóstico
```sql
-- Verificar adoção v3 vs v1
SELECT 
  COUNT(*) FILTER (WHERE output IS NOT NULL) AS v3_jobs,
  COUNT(*) FILTER (WHERE output IS NULL) AS v1_jobs,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE output IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_v3
FROM jobs
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### 🛠️ Causa Provável
Script do agente não sincronizado ou função `Submit-JobResult` não implementada/não está sendo chamada.

### ✅ Ações

#### 4.1 Sincronizar script do agente:
```bash
# No repositório
npm run sync:agent

# Verificar se houve mudanças
git diff public/agent-scripts/cybershield-agent-windows-v3.ps1
git diff supabase/functions/_shared/agent-script-windows-content.ts
```

#### 4.2 Verificar script na VM contém função Submit-JobResult:
```powershell
# Na VM
Select-String -Path "C:\CyberShield\cybershield-agent-*.ps1" -Pattern "function Submit-JobResult"

# Deve retornar: linha onde a função está definida
```

#### 4.3 Criar job de teste v3:
```sql
-- Criar job de teste para validar v3
INSERT INTO jobs (
  id,
  agent_name,
  type,
  payload,
  status,
  tenant_id,
  created_at
)
SELECT
  gen_random_uuid(),
  a.agent_name,
  'integration_test',
  '{"message": "Test Jobs v3 implementation"}'::jsonb,
  'queued',
  a.tenant_id,
  NOW()
FROM agents a
WHERE a.status = 'active'
ORDER BY a.last_heartbeat DESC
LIMIT 1;

-- Aguardar 60 segundos e verificar
SELECT 
  id,
  agent_name,
  status,
  output IS NOT NULL AS is_v3,
  execution_time_seconds,
  error_message
FROM jobs
WHERE type = 'integration_test'
ORDER BY created_at DESC
LIMIT 1;
```

**Resultado esperado:**
- ✅ `status = 'completed'` ou `'failed'`
- ✅ `output` não é NULL
- ✅ `execution_time_seconds` > 0

#### 4.4 Se necessário: Reinstalar agente com script atualizado
1. Sincronizar script: `npm run sync:agent`
2. Gerar novo instalador no dashboard
3. Reinstalar nas VMs

---

## 5. Agente Gerando 401 Unauthorized

### 🔴 Sintomas
- Logs do agente mostram: `401 Unauthorized`
- Heartbeats falhando
- Jobs não sendo processados
- Agente fica em loop tentando autenticar

### 🔍 Diagnóstico
```powershell
# Ver últimos erros 401 nos logs
Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" | Select-String "401|Unauthorized" -Context 2

# Extrair credenciais do script
Select-String -Path "C:\CyberShield\cybershield-agent-*.ps1" -Pattern "param\(|AgentToken|HmacSecret" | Select-Object -First 10
```

```sql
-- Verificar credenciais válidas no banco
SELECT 
  a.agent_name,
  a.hmac_secret,
  LENGTH(a.hmac_secret) as hmac_length,
  t.token,
  LENGTH(t.token) as token_length,
  t.is_active,
  t.expires_at
FROM agents a
LEFT JOIN agent_tokens t ON t.agent_id = a.id
WHERE a.agent_name = 'NOME_DO_AGENTE';
```

### 🛠️ Possíveis Causas

| Causa | Como Identificar | Solução |
|-------|------------------|---------|
| Token/HMAC inválidos | `hmac_secret` no banco ≠ script | Regenerar credenciais |
| Token expirado | `expires_at < NOW()` | Regenerar token |
| Token desativado | `is_active = false` | Reativar ou regenerar |
| HMAC mal-formado | `LENGTH(hmac_secret) ≠ 128` | Regenerar credenciais |
| Nome do agente errado | Script usa nome diferente do banco | Verificar `agent_name` |

### ✅ Resolução
1. Ir para `/admin/agent-troubleshooting`
2. Buscar agente pelo nome
3. Clicar em "Regenerar Credenciais"
4. Baixar novo instalador
5. Reinstalar na VM como Administrador
6. Validar heartbeat em < 2 minutos

---

## 📊 Scripts de Diagnóstico Rápido

### Script PowerShell: Diagnóstico Completo do Agente
```powershell
# Executar na VM como Administrador
param(
    [Parameter(Mandatory=$true)]
    [string]$AgentName
)

Write-Host "=== Diagnóstico: $AgentName ===" -ForegroundColor Cyan

# 1. Task
$task = Get-ScheduledTask -TaskName "CyberShieldAgent-$AgentName" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "✅ Task existe: $($task.State)" -ForegroundColor Green
    $taskInfo = Get-ScheduledTaskInfo -TaskName $task.TaskName
    Write-Host "   LastRunTime: $($taskInfo.LastRunTime)"
    Write-Host "   LastTaskResult: $($taskInfo.LastTaskResult) $(if ($taskInfo.LastTaskResult -eq 0) {'✅'} else {'❌'})"
} else {
    Write-Host "❌ Task não encontrada" -ForegroundColor Red
}

# 2. Script
$scriptPath = "C:\CyberShield\cybershield-agent-$AgentName.ps1"
if (Test-Path $scriptPath) {
    $scriptSize = (Get-Item $scriptPath).Length
    $sizeOk = $scriptSize -gt 50000
    Write-Host "$(if ($sizeOk) {'✅'} else {'❌'}) Script: $scriptSize bytes" -ForegroundColor $(if ($sizeOk) {'Green'} else {'Red'})
} else {
    Write-Host "❌ Script não encontrado: $scriptPath" -ForegroundColor Red
}

# 3. Logs
$logPath = "C:\CyberShield\logs\cybershield-agent-v3.log"
if (Test-Path $logPath) {
    Write-Host "✅ Log do agente existe" -ForegroundColor Green
    
    $lastErrors = Get-Content $logPath | Select-String "ERROR|401|timeout|Unauthorized" | Select-Object -Last 5
    if ($lastErrors) {
        Write-Host "⚠️ Últimos erros:" -ForegroundColor Yellow
        $lastErrors | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow }
    } else {
        Write-Host "✅ Sem erros recentes" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Log do agente não encontrado" -ForegroundColor Red
}

# 4. Conectividade
try {
    $response = Invoke-WebRequest -Uri "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "✅ Conectividade OK (status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Falha de conectividade: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Fim do diagnóstico ===" -ForegroundColor Cyan
```

---

## 📞 Contatos e Escalação

**Nível 1 - Troubleshooting Básico:**
- Dashboard: `/admin/agent-troubleshooting`
- Documentação: `docs/INSTALLER_TROUBLESHOOTING.md`
- Logs: Edge Functions no Supabase Dashboard

**Nível 2 - Análise Técnica:**
- SQL queries: `docs/jobs_v3_migration_monitoring.sql`
- Logs do banco: `audit_logs`, `security_logs`
- Supabase Dashboard: Logs & Metrics

**Nível 3 - Engenharia:**
- GitHub Issues: Reportar bugs sistemáticos
- Review código: `installer-template.ts`, `agent-script-windows-content.ts`
- Pipeline CI/CD: GitHub Actions logs

---

**Última atualização:** 2025-11-19
**Versão:** 1.0.0
**Autor:** CyberShield Security Team
