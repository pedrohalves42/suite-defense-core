# FASE 4 e 5: Testes Manuais e Limpeza de Agentes

## ✅ IMPLEMENTADO

### SQL Functions:
- ✅ `v_problematic_agents` - View para identificar agentes problemáticos
- ✅ `cleanup_problematic_agent(p_agent_id)` - Limpar agente específico
- ✅ `cleanup_all_problematic_agents(p_tenant_id)` - Limpeza em massa
- ✅ `diagnose_agent(p_agent_name)` - Diagnóstico completo

### Dashboard:
- ✅ `/admin/problematic-agents` - Interface web para gerenciar agentes
- ✅ Botões de limpeza individual e em massa
- ✅ Visualização de métricas (tokens, jobs pendentes, tempo decorrido)

### Edge Functions:
- ✅ `diagnose-agent` - API para diagnóstico de agentes

### Scripts:
- ✅ `scripts/debug-vm-install.ps1` - Script de diagnóstico para VM

---

## 🖥️ FASE 4: Teste Manual na VM

### Pré-requisitos na VM Windows:
```powershell
# Verificar que você está rodando como Administrador
[Security.Principal.WindowsIdentity]::GetCurrent().Groups -contains 'S-1-5-32-544'

# Verificar versão do PowerShell (>= 5.1)
$PSVersionTable.PSVersion

# Verificar conectividade
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443
```

### PASSO 1: Gerar Instalador no Dashboard

1. Acesse `/admin/agent-installer`
2. Digite nome do agente: `testevm-fase4`
3. Selecione plataforma: **Windows**
4. Clique em "Generate Installer"
5. Baixe o arquivo `.ps1` gerado

### PASSO 2: Preparar VM para Teste

```powershell
# 1. Criar pasta para testes
New-Item -ItemType Directory -Path "C:\CyberShield-Tests" -Force
cd C:\CyberShield-Tests

# 2. Copiar o instalador baixado para C:\CyberShield-Tests\install-testevm-fase4.ps1

# 3. Copiar o script de debug
# Baixar de: https://github.com/seu-repo/blob/main/scripts/debug-vm-install.ps1
# Salvar como: C:\CyberShield-Tests\debug-vm-install.ps1

# 4. Desbloquear arquivos
Unblock-File .\install-testevm-fase4.ps1
Unblock-File .\debug-vm-install.ps1
```

### PASSO 3: Executar Script de Diagnóstico

```powershell
# Obter credenciais do agente no SQL:
# SELECT t.token, a.hmac_secret 
# FROM agents a 
# JOIN agent_tokens t ON t.agent_id = a.id 
# WHERE a.agent_name = 'testevm-fase4'

.\debug-vm-install.ps1 `
  -InstallerPath ".\install-testevm-fase4.ps1" `
  -AgentToken "COLE_TOKEN_AQUI" `
  -HmacSecret "COLE_HMAC_64_CHARS_AQUI" `
  -AgentName "testevm-fase4"
```

### PASSO 4: Analisar Resultados

O script irá verificar:
1. ✅ Privilégios de Administrador
2. ✅ Versão do PowerShell
3. ✅ Arquivo do instalador (e desbloquear se necessário)
4. ✅ Conectividade com backend (`/health` endpoint)
5. ✅ Credenciais do agente (formato válido)
6. ✅ Capacidade de criar pastas
7. ✅ Execução do instalador com log detalhado

**Log gerado:** `C:\install-debug-YYYYMMDD-HHmmss.log`

### PASSO 5: Validar Instalação

```powershell
# 1. Verificar pasta criada
Test-Path C:\CyberShield
Get-ChildItem C:\CyberShield

# 2. Verificar script do agente
Get-Content C:\CyberShield\cybershield-agent-testevm-fase4.ps1 | Select-Object -First 20

# 3. Verificar logs
Get-Content C:\CyberShield\logs\installer.log
Get-Content C:\CyberShield\logs\agent.log -Tail 50

# 4. Verificar Scheduled Task
Get-ScheduledTask -TaskName "CyberShieldAgent*" | Select-Object TaskName, State, LastRunTime

# 5. Ver se o processo está rodando
Get-ScheduledTask -TaskName "CyberShieldAgent-testevm-fase4" | Get-ScheduledTaskInfo
```

### PASSO 6: Validar no Dashboard

1. Acesse `/admin/monitoring-advanced`
2. Procure por `testevm-fase4`
3. Verifique:
   - ✅ Status: `active`
   - ✅ Last Heartbeat: menos de 2 minutos atrás
   - ✅ OS Info: Windows version preenchida

---

## 🧹 FASE 5: Limpeza de Agentes Problemáticos

### Interface Web (RECOMENDADO)

1. **Acesse:** `/admin/problematic-agents`
2. **Visualize:** Lista de agentes com problemas
3. **Ações disponíveis:**
   - **Limpar Individual:** Botão "Limpar" em cada card
   - **Limpar Todos:** Botão "Limpar Todos" no topo

### O que a Limpeza Faz:
- ✅ Invalida todos os tokens ativos do agente
- ✅ Remove jobs pendentes (status `queued` ou `delivered`)
- ✅ Reseta status do agente para `pending`
- ✅ Cria log de auditoria da operação

### Limpeza via SQL (Alternativa Manual)

```sql
-- 1. Identificar agentes problemáticos
SELECT * FROM v_problematic_agents
WHERE tenant_id = 'SEU_TENANT_ID'
ORDER BY enrolled_at DESC;

-- 2. Limpar agente específico
SELECT * FROM cleanup_problematic_agent('AGENT_ID_AQUI');

-- 3. Limpar todos os agentes problemáticos do tenant
SELECT * FROM cleanup_all_problematic_agents('TENANT_ID_AQUI');

-- 4. Diagnóstico detalhado
SELECT * FROM diagnose_agent('nome-do-agente');
```

### Fluxo de Reinstalação Pós-Limpeza

#### 1. No Dashboard:
```
/admin/agent-troubleshooting
→ Selecionar agente
→ Clicar "Regenerate Credentials"
→ Confirmar regeneração
```

#### 2. Na VM Windows:
```powershell
# A. Parar processos
Get-Process -Name "*cybershield*" -ErrorAction SilentlyContinue | Stop-Process -Force

# B. Remover Scheduled Task
Unregister-ScheduledTask -TaskName "CyberShieldAgent*" -Confirm:$false -ErrorAction SilentlyContinue

# C. Remover pasta completamente
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue

# D. Confirmar limpeza
Test-Path C:\CyberShield  # Deve retornar False
Get-ScheduledTask -TaskName "CyberShieldAgent*" -ErrorAction SilentlyContinue  # Não deve retornar nada
```

#### 3. Gerar e Instalar Novo:
```
/admin/agent-installer
→ Preencher nome do agente (mesmo nome)
→ Selecionar Windows
→ Generate Installer
→ Baixar e executar como Administrador na VM
```

#### 4. Validar Nova Instalação:
```powershell
# Verificar logs
Get-Content C:\CyberShield\logs\installer.log
Get-Content C:\CyberShield\logs\agent.log -Tail 20

# Verificar task
Get-ScheduledTask -TaskName "CyberShieldAgent*"

# No dashboard, verificar heartbeat em até 2 minutos
```

---

## 🔍 Diagnóstico de Problemas Comuns

### Problema 1: "Pasta C:\CyberShield não foi criada"

**Causas possíveis:**
- Script não executou (permissões)
- ExecutionPolicy bloqueou
- Erro de sintaxe no instalador antes da criação da pasta

**Solução:**
```powershell
# Ver se há erros de sintaxe
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ServerUrl "..." -AgentToken "..." -HmacSecret "..." -AgentName "..." -Verbose

# Se aparecer "ExecutionPolicy", rodar como admin:
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
```

### Problema 2: "Agente fica em 'pending' sem heartbeat"

**Diagnóstico no SQL:**
```sql
SELECT 
  a.agent_name,
  a.status,
  t.token,
  a.hmac_secret,
  a.last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))/60 as minutes_since_enrollment
FROM agents a
LEFT JOIN agent_tokens t ON t.agent_id = a.id
WHERE a.agent_name = 'testevm-fase4';
```

**Verificar na VM:**
```powershell
# Ver se o agente está rodando
Get-ScheduledTaskInfo -TaskName "CyberShieldAgent-testevm-fase4"

# Ver últimas linhas do log do agente
Get-Content C:\CyberShield\logs\agent.log -Tail 50

# Procurar por erros 401 (token/HMAC inválido)
Select-String -Path C:\CyberShield\logs\agent.log -Pattern "401|Unauthorized|HMAC"
```

**Solução se token/HMAC divergem:**
1. Limpar agente: `/admin/problematic-agents` → Limpar
2. Regenerar credenciais: `/admin/agent-troubleshooting` → Regenerate Credentials
3. Limpar VM completamente (ver passos acima)
4. Reinstalar com novo instalador

### Problema 3: "Scheduled Task não inicia"

**Diagnóstico:**
```powershell
# Ver informações da task
Get-ScheduledTask -TaskName "CyberShieldAgent*" | Format-List *

# Ver histórico de execução
Get-ScheduledTask -TaskName "CyberShieldAgent-testevm-fase4" | Get-ScheduledTaskInfo

# Tentar iniciar manualmente
Start-ScheduledTask -TaskName "CyberShieldAgent-testevm-fase4"

# Ver eventos do Windows
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 20 | Where-Object { $_.Message -like "*CyberShield*" }
```

**Soluções:**
- Se "Access Denied": Task deve rodar como SYSTEM (verificar Principal)
- Se "File not found": Caminho do script está errado (verificar Action)
- Se task nunca roda: Trigger pode estar errado (deve ser AtStartup)

### Problema 4: "401 Unauthorized em todas as requisições"

**Causas:**
- Token UUID inválido ou não encontrado no banco
- HMAC secret divergente (não são os 64 hex chars corretos)
- Assinatura HMAC calculada incorretamente no agente

**Verificação:**
```sql
-- Comparar token e HMAC entre banco e logs
SELECT 
  a.agent_name,
  t.token as db_token,
  substring(a.hmac_secret, 1, 8) as hmac_prefix,
  length(a.hmac_secret) as hmac_length
FROM agents a
JOIN agent_tokens t ON t.agent_id = a.id
WHERE a.agent_name = 'testevm-fase4';
```

Comparar com o log do agente:
```powershell
Select-String -Path C:\CyberShield\logs\agent.log -Pattern "AgentToken|HmacSecret" | Select-Object -First 5
```

Se divergem → Limpar e reinstalar (ver FASE 5).

---

## 📊 Métricas de Sucesso

### FASE 4 (Instalação):
- ✅ Script `debug-vm-install.ps1` executa sem erros
- ✅ Pasta `C:\CyberShield` é criada
- ✅ Script do agente é criado com conteúdo válido (>5000 chars)
- ✅ Logs de instalação são gerados
- ✅ Scheduled Task é criada e está em estado `Ready`
- ✅ Agente aparece no dashboard com status `active` em <5 minutos
- ✅ Heartbeat é enviado regularmente (a cada 60s)

### FASE 5 (Limpeza):
- ✅ Interface `/admin/problematic-agents` lista agentes com problemas
- ✅ Limpeza individual funciona (tokens invalidados, jobs removidos)
- ✅ Limpeza em massa funciona para múltiplos agentes
- ✅ Logs de auditoria são criados para cada limpeza
- ✅ Após limpeza + reinstalação, agente fica `active` com heartbeat

---

## 🎯 Próximos Passos (FASE 6+)

1. **Validação de Jobs v3:**
   - Criar job de teste via dashboard
   - Verificar que `output`, `execution_time_seconds` são preenchidos
   - Atualizar dashboard para usar `jobs_normalized` view

2. **CI/CD:**
   - Adicionar scripts de validação no `package.json`
   - Criar workflow GitHub Actions
   - Configurar secrets necessários

3. **Observabilidade:**
   - Edge function `check-production-health`
   - Dashboard de alertas em tempo real
   - Cron job para monitoramento contínuo

---

## 📝 Logs e Troubleshooting

### Logs na VM:
- **Instalador:** `C:\CyberShield\logs\installer.log`
- **Agente:** `C:\CyberShield\logs\agent.log`
- **Debug:** `C:\install-debug-*.log` (gerado pelo script de debug)

### Logs no Backend:
```bash
# Ver logs do serve-installer
supabase functions logs serve-installer --tail 50

# Ver logs do heartbeat
supabase functions logs heartbeat --tail 50

# Ver logs do submit-job-result
supabase functions logs submit-job-result --tail 50
```

### Queries SQL de Debug:
```sql
-- Ver últimas instalações
SELECT * FROM installation_analytics
WHERE agent_name LIKE '%testevm%'
ORDER BY created_at DESC
LIMIT 10;

-- Ver agentes recém-criados
SELECT 
  agent_name,
  status,
  enrolled_at,
  last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - enrolled_at))/60 as minutes_since_enrollment
FROM agents
WHERE enrolled_at > NOW() - INTERVAL '1 hour'
ORDER BY enrolled_at DESC;

-- Ver jobs do agente
SELECT 
  id,
  type,
  status,
  created_at,
  delivered_at,
  output,
  error_message
FROM jobs
WHERE agent_name = 'testevm-fase4'
ORDER BY created_at DESC;
```

---

## ✅ Checklist de Validação Final

### Instalação Completa:
- [ ] `debug-vm-install.ps1` executou todas as 7 verificações
- [ ] Log de debug não contém erros críticos
- [ ] Pasta `C:\CyberShield` existe
- [ ] Script `cybershield-agent-*.ps1` existe e tem >5000 bytes
- [ ] Log `installer.log` mostra "Instalação concluída com sucesso"
- [ ] Scheduled Task existe e está `Ready` ou `Running`
- [ ] Log `agent.log` mostra heartbeats sendo enviados
- [ ] Dashboard mostra agente `active` com heartbeat recente

### Limpeza Funcional:
- [ ] `/admin/problematic-agents` lista agentes com >10min sem heartbeat
- [ ] Botão "Limpar" invalida tokens e remove jobs
- [ ] Toast de sucesso aparece após limpeza
- [ ] Audit log registra a operação
- [ ] Após regenerar credenciais + reinstalar, agente volta a `active`

### Segurança:
- [ ] Instalador verifica privilégios de admin
- [ ] HMAC é validado no backend (401 se inválido)
- [ ] Tokens invalidados não permitem autenticação
- [ ] RLS policies bloqueiam acesso cross-tenant

Se TODOS os checkboxes estiverem marcados, **FASE 4 e 5 estão validadas** ✅
