# 🧹 Guia de Limpeza de Agentes Fantasma

## Problema: Múltiplos Agentes Rodando

Quando você reinstala o agente ou cria novos tokens, processos antigos podem continuar rodando em paralelo, causando:

- ❌ Logs poluídos com erros 401
- ❌ Consumo desnecessário de recursos
- ❌ Conflitos de heartbeat
- ❌ Comportamento imprevisível

## Sintomas de Agentes Fantasma

Verifique os logs do agente (`C:\CyberShield\logs\agent.log`) para:

```
[ERROR] ❌ Authentication failure (401)
[WARN] ⚠️ HMAC rejeitado (código 401), tentando fallback...
[ERROR] ❌ Fallback também falhou: (401) Não Autorizado.
```

Se você vê múltiplos `AgentToken:` diferentes nos logs, você tem agentes fantasma.

---

## 🔧 Solução: Scripts de Limpeza

### 1️⃣ Script de Limpeza Automatizada

**Arquivo:** `scripts/cleanup-agents.ps1`

#### Uso Básico

```powershell
# Modo DRY-RUN (apenas mostra o que seria feito)
.\scripts\cleanup-agents.ps1 -DryRun -Verbose

# Modo REAL (remove processos fantasma)
.\scripts\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc", "2ecb14a9")
```

#### Parâmetros

| Parâmetro | Descrição | Exemplo |
|-----------|-----------|---------|
| `-ValidTokenPrefixes` | Prefixos dos tokens válidos (primeiros 8 caracteres) | `@("3e1973dc")` |
| `-DryRun` | Executa sem fazer mudanças (teste) | `-DryRun` |
| `-Verbose` | Mostra detalhes de cada processo | `-Verbose` |

#### Como Descobrir Tokens Válidos

**No Supabase:**

```sql
SELECT 
  agent_name,
  LEFT(agent_token, 8) as token_prefix,
  last_heartbeat,
  status
FROM agents
WHERE last_heartbeat > NOW() - INTERVAL '10 minutes'
ORDER BY last_heartbeat DESC;
```

Anote os `token_prefix` dos agentes que você quer **manter**.

---

### 2️⃣ Script de Recriação de Task

**Arquivo:** `scripts/recreate-agent-task.ps1`

Depois de limpar processos fantasma, recrie a Scheduled Task com credenciais corretas.

#### Uso

```powershell
.\scripts\recreate-agent-task.ps1 `
  -AgentToken "3e1973dc-b10f-4b3a-8dd3-42f9b7e5a6c8" `
  -HmacSecret "ab482e64dc2c..." `
  -AgentName "pcteste1" `
  -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co" `
  -ScriptPath "C:\CyberShield\cybershield-agent.ps1"
```

#### O que o script faz

1. ✅ Remove task anterior (se existir)
2. ✅ Cria nova task com triggers corretas:
   - Executa no startup do sistema
   - Repete a cada 5 minutos
3. ✅ Configura para rodar como SYSTEM
4. ✅ Inicia a task automaticamente
5. ✅ Mostra status e próxima execução

---

## 🔍 Diagnóstico Manual

Se preferir fazer manualmente:

### Listar Processos do Agente

```powershell
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*cybershield-agent*'
} | Select-Object ProcessId, CommandLine | Format-List
```

### Matar Processo Específico

```powershell
Stop-Process -Id <PID> -Force
```

### Listar Scheduled Tasks

```powershell
Get-ScheduledTask | Where-Object {
  $_.TaskName -like '*CyberShield*'
} | Select-Object TaskName, State, @{N='LastRun';E={(Get-ScheduledTaskInfo $_.TaskName).LastRunTime}}
```

### Remover Task

```powershell
Unregister-ScheduledTask -TaskName "CyberShieldAgent" -Confirm:$false
```

---

## ✅ Checklist de Validação

Após a limpeza, confirme que tudo está correto:

### 1. Verificar Processos

```powershell
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*cybershield-agent*'
} | Measure-Object
```

**Esperado:** `Count: 1` (apenas um processo)

### 2. Verificar Logs

```powershell
Get-Content "C:\CyberShield\logs\agent.log" -Tail 50 | Select-String "401|200|AgentToken"
```

**Esperado:**
- ✅ Apenas um `AgentToken:` aparecendo
- ✅ Apenas `Status: 200` (sem 401)
- ✅ Nenhuma tentativa de `heartbeat-fallback`

### 3. Verificar no Dashboard

Acesse o dashboard e confirme:
- ✅ Apenas 1 agente com o nome correto
- ✅ Status mudou de `pending` para `active` após ~5 minutos
- ✅ `last_heartbeat` está recente (< 60 segundos)

### 4. Verificar no Supabase

```sql
SELECT 
  agent_name,
  status,
  last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat))::INTEGER as seconds_ago
FROM agents
WHERE agent_name = 'SEU_AGENT_NAME'
ORDER BY last_heartbeat DESC;
```

**Esperado:**
- ✅ `status = 'active'`
- ✅ `seconds_ago < 60`

---

## 🚨 Troubleshooting

### Problema: Script não encontra processos

**Solução:** O agente pode estar rodando como serviço ou em sessão de outro usuário.

```powershell
# Buscar em TODAS as sessões
Get-Process powershell* | Where-Object {
  $_.Path -like '*powershell.exe'
} | Select-Object Id, SessionId, StartTime
```

### Problema: Não consigo matar o processo

**Solução:** Use força administrativa.

```powershell
# Forçar kill mesmo se travado
taskkill /F /PID <PID>
```

### Problema: Task volta a aparecer após remoção

**Solução:** Pode haver GPO ou outro mecanismo recriando a task. Verifique:

```powershell
# Ver todas as tasks do sistema (incluindo ocultas)
Get-ScheduledTask -TaskPath "\*" | Where-Object {
  $_.TaskName -like '*CyberShield*'
}
```

### Problema: Ainda vejo 401 após limpeza

**Causas possíveis:**

1. **Clock skew:** Relógio do sistema dessincronizado
   ```powershell
   w32tm /resync /force
   ```

2. **Token inválido no banco:** Token foi revogado/expirado
   ```sql
   -- Verificar se token está ativo
   SELECT * FROM agent_tokens 
   WHERE token = 'SEU_TOKEN' 
   AND is_active = true;
   ```

3. **HMAC secret incorreto:** Secret no script não bate com o banco
   ```sql
   -- Conferir HMAC no banco
   SELECT hmac_secret FROM agents 
   WHERE agent_name = 'SEU_AGENT_NAME';
   ```

---

## 📊 Exemplo de Limpeza Completa

**Cenário:** Você tem 4 processos rodando, mas só quer manter o `pcteste1`.

### Passo 1: Descobrir token válido

```sql
SELECT agent_name, LEFT(agent_token, 8) as prefix
FROM agents
WHERE agent_name = 'pcteste1';
```

**Resultado:** `3e1973dc`

### Passo 2: Executar limpeza

```powershell
# Testar primeiro
.\scripts\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc") -DryRun -Verbose

# Aplicar
.\scripts\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc")
```

**Output esperado:**
```
🧹 CyberShield Agent Cleanup Tool
=================================

📊 Fase 1: Diagnosticando processos...
   Processos encontrados: 4

🔪 Fase 2: Identificando processos fantasma...
   ❌ Matando PID 1234...
   ❌ Matando PID 5678...
   ❌ Matando PID 9012...
   Processos válidos mantidos: 1
   Processos fantasma removidos: 3

🗑️  Fase 3: Limpando Scheduled Tasks...
   🗑️  Removendo task: CyberShieldAgent_OLD...
   Tasks removidas: 1

📋 Fase 4: Verificação final...
   Processos restantes: 1
   Tasks restantes: 0

🎉 Limpeza concluída com sucesso!
```

### Passo 3: Recriar task limpa

```powershell
.\scripts\recreate-agent-task.ps1 `
  -AgentToken "3e1973dc-..." `
  -HmacSecret "ab482e64..." `
  -AgentName "pcteste1"
```

### Passo 4: Validar

```powershell
# Ver logs (aguardar 60s)
Get-Content "C:\CyberShield\logs\agent.log" -Tail 20 -Wait
```

**Output esperado:**
```
[DEBUG] 📡 Enviando heartbeat...
[DEBUG]    AgentToken: 3e1973dc...
[DEBUG] ✅ POST https://...supabase.co/functions/v1/heartbeat - Status: 200
[SUCCESS] ✅ Heartbeat enviado com sucesso (Status: 200)
```

✅ **Sucesso!** Apenas um agente rodando com autenticação limpa.

---

## 📝 Boas Práticas

1. **Sempre use DRY-RUN primeiro** antes de executar limpeza real
2. **Anote tokens válidos** antes de limpar processos
3. **Verifique logs** após cada limpeza
4. **Mantenha apenas 1 task** por agente
5. **Use SYSTEM user** para tasks em produção
6. **Configure restart automático** nas tasks (já incluído no script)

---

## 🆘 Suporte

Se após seguir este guia você ainda tiver problemas:

1. Capture logs completos: `Get-Content C:\CyberShield\logs\agent.log | Out-File debug.txt`
2. Capture estado do sistema:
   ```powershell
   Get-CimInstance Win32_Process | Where-Object {
     $_.CommandLine -like '*cybershield*'
   } | Out-File processos.txt
   
   Get-ScheduledTask | Where-Object {
     $_.TaskName -like '*CyberShield*'
   } | Out-File tasks.txt
   ```
3. Entre em contato com suporte técnico incluindo:
   - `debug.txt`
   - `processos.txt`
   - `tasks.txt`
   - Resultado de `w32tm /query /status`

---

## 🔄 Automação Futura

Para evitar agentes fantasma no futuro, considere:

1. **Pre-installation cleanup:** Adicionar `cleanup-agents.ps1` ao início do installer
2. **Health check endpoint:** Endpoint que retorna lista de agentes duplicados
3. **Dashboard warning:** Alertar admin quando múltiplos agentes aparecem do mesmo host
4. **Single instance lock:** Implementar mutex no agente Python para prevenir múltiplas instâncias

---

**Versão:** 1.0  
**Última atualização:** 2025-01-17  
**Autor:** CyberShield DevOps Team
