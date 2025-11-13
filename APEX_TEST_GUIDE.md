# 🧪 APEX v3.0.0 - Guia de Teste Completo

## 📋 Pré-requisitos

### Ambiente de Teste
- ✅ VM Windows limpa (Windows 10/11 ou Server 2019/2022)
- ✅ Conexão com internet
- ✅ Acesso como Administrador
- ✅ PowerShell 5.1+ instalado
- ✅ Ferramentas de captura de logs (opcional)

### Credenciais
- ✅ Acesso ao painel CyberShield (`https://iavbnmduxpxhwubqrzzn.supabase.co`)
- ✅ Usuário com permissões de admin/tenant

---

## 🚀 FASE 1: Gerar Instalador .EXE via GitHub Actions

### 1.1 Acessar Interface de Build
1. Faça login no painel CyberShield
2. Navegue para **Agent Installer** (`/agent-installer`)
3. Localize a seção **"Gerar Instalador .EXE"**

### 1.2 Configurar Agente
```
Nome do Agente: test-agent-apex-v3
Plataforma: Windows
```

### 1.3 Disparar Build
1. Clique no botão **"Gerar Instalador .EXE"**
2. O sistema irá:
   - ✅ Criar enrollment key
   - ✅ Gerar credenciais (AgentToken, HmacSecret)
   - ✅ Disparar GitHub Actions via repository_dispatch
   - ✅ Compilar .PS1 → .EXE usando ps2exe
   - ✅ Retornar .EXE pronto via callback

### 1.4 Monitorar Progresso
A UI mostrará:
```
Status: Building...
GitHub Actions: https://github.com/your-repo/actions/runs/XXXXXX
Tempo estimado: 3-5 minutos
```

### 1.5 Download do Instalador
Após conclusão:
```
✅ Build completado!
📦 CyberShield-Agent-test-agent-apex-v3.exe (2.1 MB)
🔒 SHA256: abc123...
```

**Ação:** Clique em **"Download .EXE"** e salve o arquivo

---

## 🖥️ FASE 2: Instalação em VM Limpa

### 2.1 Preparar VM
1. **Snapshot inicial** (para rollback se necessário)
2. Desabilitar Windows Defender temporariamente (para evitar falsos positivos):
   ```powershell
   Set-MpPreference -DisableRealtimeMonitoring $true
   ```

### 2.2 Executar Instalador
1. Copie o `.exe` para a VM (via RDP, shared folder, etc.)
2. Clique com botão direito → **"Executar como Administrador"**
3. Aceite o prompt do UAC

### 2.3 Observar Saída do Instalador
O instalador APEX v3.0.0 exibirá:
```powershell
========================================
CyberShield Agent Installer v3.0.0-APEX
========================================

[✓] Verificando privilégios de administrador...
[✓] PowerShell 5.1+ detectado
[✓] Criando diretório C:\CyberShield...
[✓] Salvando agente (cybershield-agent-windows.ps1)...
[✓] Criando config.json...
[✓] Registrando Scheduled Task...
[✓] Iniciando agente pela primeira vez...

[✓] INSTALAÇÃO CONCLUÍDA!

Agente ID: agt_xxxxxxxxxxxxx
Server: https://iavbnmduxpxhwubqrzzn.supabase.co
Status: Running (Scheduled Task)
Logs: C:\CyberShield\logs\agent.log

Pressione Enter para fechar...
```

### 2.4 Validações Pós-Instalação
Execute os seguintes comandos no PowerShell:

#### ✅ Verificar Arquivos Instalados
```powershell
Get-ChildItem C:\CyberShield -Recurse
```
**Esperado:**
```
C:\CyberShield\
  ├── cybershield-agent-windows.ps1
  ├── config.json
  └── logs\
      └── agent.log
```

#### ✅ Verificar Scheduled Task
```powershell
Get-ScheduledTask -TaskName "CyberShield Agent" | Format-List *
```
**Esperado:**
```
TaskName  : CyberShield Agent
State     : Running
Author    : SYSTEM
Actions   : PowerShell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "C:\CyberShield\cybershield-agent-windows.ps1" -AgentToken "agt_xxxxx" -HmacSecret "hmac_xxxxx" -ServerUrl "https://..." -PollInterval 60
Triggers  : At system startup
```

#### ✅ Verificar Processo Ativo
```powershell
Get-Process | Where-Object { $_.CommandLine -like "*cybershield-agent*" }
```
**Esperado:** Processo PowerShell rodando o agente

---

## 💓 FASE 3: Validar Heartbeat

### 3.1 Aguardar Primeiro Heartbeat
- **Tempo esperado:** < 2 minutos após instalação
- O agente enviará heartbeat automaticamente

### 3.2 Verificar no Painel
1. Navegue para **Agent Monitoring** (`/agent-monitoring`)
2. Localize o agente `test-agent-apex-v3`
3. Validar:
   - ✅ **Status:** Online (verde)
   - ✅ **Last Seen:** < 2 minutos atrás
   - ✅ **Heartbeat Interval:** 60s
   - ✅ **Version:** v3.0.0-APEX

### 3.3 Validar na Base de Dados
Execute query no Supabase:
```sql
SELECT 
  id,
  agent_name,
  status,
  last_seen,
  heartbeat_interval_seconds,
  created_at
FROM agents
WHERE agent_name = 'test-agent-apex-v3'
ORDER BY created_at DESC
LIMIT 1;
```

**Esperado:**
```
id: agt_xxxxx
agent_name: test-agent-apex-v3
status: active
last_seen: 2025-01-13 10:47:32 (< 2 min)
heartbeat_interval_seconds: 60
```

---

## 📝 FASE 4: Validar Logs

### 4.1 Logs do Agente (VM)
```powershell
Get-Content C:\CyberShield\logs\agent.log -Tail 50
```

**Esperado:**
```
2025-01-13 10:45:12 [INFO] CyberShield Agent v3.0.0-APEX iniciado
2025-01-13 10:45:12 [INFO] AgentToken: agt_xxxxx
2025-01-13 10:45:12 [INFO] ServerUrl: https://iavbnmduxpxhwubqrzzn.supabase.co
2025-01-13 10:45:13 [INFO] Enviando primeiro heartbeat...
2025-01-13 10:45:14 [SUCCESS] Heartbeat enviado com sucesso (200 OK)
2025-01-13 10:46:14 [SUCCESS] Heartbeat enviado com sucesso (200 OK)
2025-01-13 10:47:14 [SUCCESS] Heartbeat enviado com sucesso (200 OK)
```

### 4.2 Logs do Instalador (Telemetria)
Verificar se telemetria pós-instalação foi enviada:

**Query Supabase:**
```sql
SELECT 
  event_type,
  agent_name,
  platform,
  installation_method,
  success,
  error_details,
  created_at
FROM installation_analytics
WHERE agent_name = 'test-agent-apex-v3'
ORDER BY created_at DESC;
```

**Esperado:**
```
event_type: installation_started
agent_name: test-agent-apex-v3
platform: windows
installation_method: exe_installer
success: true
error_details: null
created_at: 2025-01-13 10:45:10
```

### 4.3 Logs do Edge Function
Verificar logs do `heartbeat` Edge Function no Supabase:
```
Supabase Dashboard → Edge Functions → heartbeat → Logs
```

**Esperado:**
```
2025-01-13 10:45:14 [INFO] Heartbeat recebido de agt_xxxxx
2025-01-13 10:45:14 [INFO] Agente test-agent-apex-v3 atualizado com sucesso
```

---

## ✅ Checklist Final de Validação

### Instalação
- [ ] .EXE baixado com sucesso
- [ ] SHA256 corresponde ao hash mostrado na UI
- [ ] Instalação concluída sem erros
- [ ] Todos os arquivos criados em `C:\CyberShield\`
- [ ] Scheduled Task criada e rodando
- [ ] Processo do agente ativo

### Comunicação
- [ ] Primeiro heartbeat enviado em < 2 minutos
- [ ] Agente aparece como "Online" no painel
- [ ] `last_seen` atualizado a cada 60 segundos
- [ ] Logs do agente mostram heartbeats bem-sucedidos
- [ ] Telemetria pós-instalação registrada

### Performance
- [ ] CPU < 5% em idle
- [ ] Memória < 50 MB
- [ ] Sem crashes ou erros no Event Viewer
- [ ] Agente sobrevive a reboot da VM

### Segurança
- [ ] Agente roda como SYSTEM (Scheduled Task)
- [ ] Credenciais (AgentToken, HmacSecret) não expostas em logs
- [ ] HMAC signature validada pelo backend
- [ ] Rate limits respeitados

---

## 🐛 Troubleshooting

### Problema: "Instalação travou na etapa de Scheduled Task"
**Solução:**
```powershell
# Verificar se task foi criada
Get-ScheduledTask -TaskName "CyberShield Agent"

# Forçar execução manual
Start-ScheduledTask -TaskName "CyberShield Agent"
```

### Problema: "Heartbeat não aparece no painel"
**Diagnóstico:**
```powershell
# 1. Verificar se agente está rodando
Get-Process | Where-Object { $_.CommandLine -like "*cybershield-agent*" }

# 2. Verificar logs
Get-Content C:\CyberShield\logs\agent.log -Tail 20

# 3. Testar conectividade
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443
```

### Problema: "Erro 401 Unauthorized nos logs"
**Causa:** AgentToken inválido ou expirado

**Solução:**
1. Gerar novo instalador com novas credenciais
2. Reinstalar o agente

---

## 📊 Critérios de Sucesso

### ✅ Taxa de Sucesso Esperada
- **Instalação:** ≥ 95%
- **Primeiro Heartbeat:** ≥ 98%
- **Heartbeat Contínuo:** ≥ 99.5%
- **Uptime 24h:** ≥ 99%

### ✅ Métricas de Performance
- **Tempo de instalação:** < 30 segundos
- **Tempo até primeiro heartbeat:** < 2 minutos
- **Latência de heartbeat:** < 500ms
- **CPU idle:** < 5%
- **Memória idle:** < 50 MB

---

## 📸 Evidências para Relatório

Capture screenshots/logs de:
1. ✅ UI de build do .EXE (antes e depois)
2. ✅ Saída completa do instalador na VM
3. ✅ Agent Monitoring mostrando status "Online"
4. ✅ Logs do agente (`agent.log`)
5. ✅ Query Supabase mostrando heartbeats
6. ✅ Scheduled Task properties
7. ✅ Process Explorer mostrando agente rodando

---

## 🎯 Próximos Passos

Após validação bem-sucedida:
1. ✅ Atualizar `APEX_IMPLEMENTATION_REPORT.md` com resultados
2. ✅ Criar release tag `v3.0.0-APEX` no GitHub
3. ✅ Distribuir instalador para clientes piloto
4. ✅ Monitorar telemetria por 48h
5. ✅ Coletar feedback e iterar

---

**Versão do Guia:** 1.0  
**Data:** 2025-01-13  
**Autor:** Agente Lovable  
**Status:** ✅ Pronto para execução
