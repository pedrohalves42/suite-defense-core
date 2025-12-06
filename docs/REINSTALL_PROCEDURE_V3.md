# Procedimento de Reinstalação de Agentes v3

## Problema: Bootstrap Problem

Agentes instalados com versões **v3.10.14 e anteriores** possuem um problema estrutural:
- O handler `update_agent` procura o script em `C:\CyberShield\cybershield-agent-v3.ps1` (path hardcoded)
- O instalador salva scripts como `C:\CyberShield\cybershield-agent-{agent_name}.ps1`
- Resultado: auto-update **sempre falha** com "arquivo não encontrado"

## Solução: Reinstalação Única

A reinstalação manual é necessária **uma única vez**. Após reinstalar com v3.10.24+, todos os auto-updates futuros funcionarão normalmente.

---

## Método 1: Script de Reinstalação (Recomendado)

### Passo 1: Gerar Nova URL de Instalação

1. Acesse o dashboard: `/admin/agent-installer`
2. Clique em "Gerar Enrollment Key"
3. Copie o comando de instalação completo

### Passo 2: Executar Script de Reinstalação

```powershell
# Baixar script de reinstalação
irm https://iavbnmduxpxhwubqrzzn.supabase.co/storage/v1/object/public/agent-scripts/reinstall-agent-v3.ps1 -OutFile reinstall.ps1

# Executar com a URL do instalador
.\reinstall.ps1 -InstallUrl "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?key=SUA_KEY_AQUI"
```

---

## Método 2: Comandos Manuais

### Passo 1: Cleanup Completo

```powershell
# Executar como Administrador

# 1. Parar processos
Get-WmiObject Win32_Process -Filter "CommandLine LIKE '%cybershield-agent%'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# 2. Remover Scheduled Tasks
Get-ScheduledTask -TaskName "CyberShield*" | Unregister-ScheduledTask -Confirm:$false

# 3. Remover pasta de instalação
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
```

### Passo 2: Nova Instalação

```powershell
# TLS 1.2 obrigatório
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Executar instalador (substitua pela URL do dashboard)
irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?key=SUA_KEY" | iex
```

---

## Método 3: One-Liner

```powershell
# Cleanup + Instalação em um comando
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false; Remove-Item "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue; irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer?key=SUA_KEY" | iex
```

---

## Validação Pós-Instalação

### 1. Verificar Scheduled Task
```powershell
Get-ScheduledTask -TaskName "CyberShield*" | Format-List TaskName, State, LastRunTime
```

### 2. Verificar Versão do Script
```powershell
Select-String -Path "C:\CyberShield\*.ps1" -Pattern "AgentVersion" | Select-Object -First 1
```

### 3. Verificar Log
```powershell
Get-Content "C:\CyberShield\agent.log" -Tail 20
```

### 4. Verificar Heartbeat no Dashboard
- Acesse `/admin/dashboard`
- Confirme que o agente aparece como **online**
- Confirme versão **v3.10.24-SMART-UPDATE** ou superior

---

## Diagnóstico de Problemas

### Script de Diagnóstico
```powershell
irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-diagnostic-script | iex
```

### Logs Relevantes
```powershell
# Log do agente
Get-Content "C:\CyberShield\agent.log" -Tail 50

# Log do instalador
Get-Content "C:\CyberShield\installer.log" -Tail 50

# Eventos do Windows
Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 20 | Where-Object { $_.Message -like "*CyberShield*" }
```

---

## Lista de Agentes para Reinstalação

Com base no diagnóstico de 24h, estes agentes precisam de reinstalação:

| Agente | Versão Atual | Último Heartbeat | Status |
|--------|--------------|------------------|--------|
| testepc2 | v3.10.21 | Recente | **Reinstalar** - update_agent falhou |
| TESTEMIT | v3.10.21 | 11h+ offline | Reinstalar quando voltar |
| TESTEBMG | v3.10.18 | 11h+ offline | Reinstalar quando voltar |
| teste | Desconhecida | 5+ dias | Reinstalar quando voltar |
| ... | ... | ... | ... |

---

## Prevenção Futura

Após reinstalação com v3.10.24+:
- ✅ Auto-update funcionará normalmente
- ✅ Path dinâmico detecta script automaticamente
- ✅ Fallback múltiplo: PSCommandPath → AgentName → Glob → Create New
- ✅ Scheduled Task recriada com path correto

---

## Suporte

Se problemas persistirem após reinstalação:
1. Execute o script de diagnóstico
2. Colete logs do agente e instalador
3. Verifique conectividade com o servidor
4. Entre em contato com suporte técnico
