# Guia de Re-deploy do Agente v3

## 🎯 Quando usar

Este script é necessário quando:
- ✅ Agente está em `status: pending` sem heartbeat
- ✅ Jobs mostram `has_output: false` (ainda está em v1)
- ✅ Após atualizar script do agente no repositório
- ✅ Para migrar agentes existentes para Jobs v3

## 📋 Pré-requisitos

1. Acesso RDP à VM do agente
2. Permissões de Administrador na VM
3. Credenciais do agente (token e HMAC secret)

## 🔧 Como executar

### Passo 1: Obter credenciais do agente

Execute este SQL no banco de dados para obter as credenciais:

```sql
SELECT 
  a.agent_name, 
  t.token, 
  a.hmac_secret 
FROM agents a
JOIN agent_tokens t ON t.agent_id = a.id
WHERE a.agent_name = 'NOME_DO_SEU_AGENTE' 
  AND t.is_active = true;
```

### Passo 2: Conectar via RDP na VM do agente

Use Remote Desktop Connection para acessar a máquina onde o agente está instalado.

### Passo 3: Executar script de re-deploy

Abra PowerShell como Administrador e execute:

```powershell
.\redeploy-agents-v3.ps1 `
  -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co" `
  -AgentToken "TOKEN_COPIADO_DO_SQL" `
  -HmacSecret "HMAC_COPIADO_DO_SQL" `
  -AgentName "NOME_DO_AGENTE"
```

**Saída esperada:**

```
🔄 Re-deploy do agente 'pcteste1' para v3...
[1/4] Parando Scheduled Task antiga...
[2/4] Baixando script v3 do backend...
✅ Script v3 baixado e validado
[3/4] Criando nova Scheduled Task...
[4/4] Iniciando nova Scheduled Task...
Última execução: 2025-01-18 10:30:00, código: 0

✅ Redeploy concluído. Verifique o log do agente em:
   C:\CyberShield\logs\cybershield-agent-v3.log
```

### Passo 4: Validar instalação

```powershell
# Verificar se script v3 foi baixado
Select-String -Path "C:\CyberShield\cybershield-agent-windows-v3.ps1" -Pattern "Submit-JobResult"

# Verificar status da Scheduled Task
Get-ScheduledTask -TaskName "CyberShieldAgent" | Select-Object State, LastRunTime, LastTaskResult

# Ver logs recentes
Get-Content "C:\CyberShield\logs\cybershield-agent-v3.log" -Tail 30
```

### Passo 5: Criar job de teste

Via dashboard, criar job `integration_test` e aguardar 2-3 minutos.

```sql
-- Validar que o agente está usando v3
SELECT 
  status, 
  output IS NOT NULL as has_v3, 
  execution_time_seconds,
  finished_at
FROM jobs 
WHERE agent_name = 'NOME_DO_AGENTE' 
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC 
LIMIT 1;
```

**Resultado esperado:**
- `status = 'completed'`
- `has_v3 = true`
- `execution_time_seconds > 0`
- `finished_at IS NOT NULL`

## ⚠️ Troubleshooting

### Script não baixa (erro de rede)

```powershell
# Testar conectividade manualmente
Invoke-WebRequest -Uri "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/setup-agent-script?platform=windows" -UseBasicParsing
```

Se falhar, verificar:
- Firewall da VM
- Proxy corporativo
- Conectividade internet

### Script baixado mas não tem Submit-JobResult

Isso indica que o Edge Function `setup-agent-script` não está retornando o script v3 correto.

```powershell
# Ver conteúdo do script baixado
Get-Content "C:\CyberShield\cybershield-agent-windows-v3.ps1" | Select-String -Pattern "function" | Select-Object -First 20
```

Deve mostrar funções como:
- `Submit-JobResult`
- `Execute-Job`
- `Send-Heartbeat`

### Scheduled Task não inicia

```powershell
# Ver detalhes do erro
Get-ScheduledTaskInfo -TaskName "CyberShieldAgent" | Select-Object LastTaskResult, LastRunTime

# Ver histórico de eventos
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 10 | Where-Object { $_.Message -like "*CyberShield*" }
```

Códigos de erro comuns:
- `0` = Sucesso
- `1` = Erro de execução (verificar logs)
- `267009` = Task não encontrada

### Jobs continuam sem output (ainda v1)

Verificar se o agente está realmente executando o script v3:

```powershell
# Ver processo em execução
Get-Process powershell | Where-Object { $_.CommandLine -like "*cybershield-agent-windows-v3.ps1*" }

# Se não aparecer, reiniciar task manualmente
Stop-ScheduledTask -TaskName "CyberShieldAgent"
Start-ScheduledTask -TaskName "CyberShieldAgent"
```

## 📊 Dashboard de Validação

Após o re-deploy, verificar no dashboard:

1. **Agent Monitoring** (`/admin/agent-monitoring`)
   - Status deve ser `active` (verde)
   - Last heartbeat recente (< 2 minutos)

2. **Jobs** (criar `integration_test`)
   - Status transita para `completed`
   - Campo `output` preenchido
   - Campo `execution_time_seconds` > 0

3. **Installation Analytics** (`/admin/installation-analytics`)
   - Evento `agent_updated` ou similar (se implementado)

## 🔄 Rollback

Se algo der errado e precisar voltar para v1:

```powershell
# Parar agente atual
Stop-ScheduledTask -TaskName "CyberShieldAgent"
Unregister-ScheduledTask -TaskName "CyberShieldAgent" -Confirm:$false

# Gerar novo instalador v1 pelo dashboard
# Executar o instalador normalmente
```

**Nota:** Agents v3 têm fallback hardcoded para v1 (`ack-job`) em caso de erro, então o sistema continua funcional mesmo com problemas no v3.

## 📞 Suporte

Se o re-deploy falhar após todas as tentativas:
1. Coletar logs: `C:\CyberShield\logs\*.log`
2. Executar diagnóstico: SQL query de validação de jobs
3. Verificar dashboard de diagnostics: `/admin/agent-diagnostics`
