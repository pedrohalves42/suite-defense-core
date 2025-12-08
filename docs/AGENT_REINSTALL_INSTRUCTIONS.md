# Guia de Reinstalação Manual de Agentes CyberShield

## ⚠️ IMPORTANTE
Este guia é para agentes com versões antigas (v3.10.21 ou anterior) que não conseguem atualizar automaticamente devido a um bug no caminho do script. A reinstalação manual é necessária **apenas uma vez** - após isso, todas as atualizações futuras funcionarão automaticamente.

---

## Agentes que Requerem Reinstalação Manual

Os seguintes agentes estão offline e precisam de reinstalação manual:
- **PC-Servidor**
- **Pc-dani**
- **Pc-Yasmin-Toca**
- **PC-Bianca-Tibery**
- **PC-Vidro**
- **PC-Meio**

---

## Passo a Passo para Reinstalação

### FASE 1: Limpeza Completa (Executar no servidor Windows)

Abrir **PowerShell como Administrador** e executar:

```powershell
# 1. Parar e remover todas as Scheduled Tasks do CyberShield
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

# 2. Parar processos PowerShell relacionados ao CyberShield
Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -like "*cybershield*" -or $_.CommandLine -like "*CyberShield*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# 3. Aguardar processos encerrarem
Start-Sleep -Seconds 3

# 4. Remover pasta de instalação completamente
Remove-Item -Path "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue

# 5. Limpar arquivos temporários
Remove-Item -Path "$env:TEMP\cybershield*" -Force -ErrorAction SilentlyContinue

# 6. Verificar limpeza completa
Write-Host "`n=== VERIFICAÇÃO ===" -ForegroundColor Cyan
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
  Write-Host "❌ Ainda existem Scheduled Tasks:" -ForegroundColor Red
  $tasks | ForEach-Object { Write-Host "   - $($_.TaskName)" }
} else {
  Write-Host "✅ Nenhuma Scheduled Task encontrada" -ForegroundColor Green
}

if (Test-Path "C:\CyberShield") {
  Write-Host "❌ Pasta C:\CyberShield ainda existe" -ForegroundColor Red
} else {
  Write-Host "✅ Pasta C:\CyberShield removida" -ForegroundColor Green
}
```

**Resultado Esperado:**
- ✅ Nenhuma Scheduled Task encontrada
- ✅ Pasta C:\CyberShield removida

---

### FASE 2: Gerar Nova Chave de Enrollment

1. Acessar o dashboard CyberShield
2. Navegar para: **Admin → Gerenciar Chaves de Enrollment** (`/admin/enrollment-keys`)
3. Clicar em **"Gerar Nova Chave"**
4. Copiar a chave gerada (será usada na Fase 3)

**⚠️ CRÍTICO:**
- **NÃO reutilizar** chaves antigas
- Cada reinstalação deve usar uma **chave nova**
- A chave expira em 24 horas se não utilizada

---

### FASE 3: Executar Novo Instalador

1. Acessar: **Admin → Instalador de Agente** (`/admin/agent-installer`)
2. Inserir o **nome do agente** (ex: PC-Servidor)
3. Inserir a **chave de enrollment** gerada na Fase 2
4. Clicar em **"Gerar Comando de Instalação"**
5. **Copiar** o comando PowerShell completo
6. No servidor Windows, abrir **PowerShell como Administrador**
7. **Colar e executar** o comando

**Exemplo de comando (NÃO usar este - gerar novo no dashboard):**
```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/PS1?key=XXXXX | iex
```

---

### FASE 4: Validar Instalação

#### No Servidor Windows:
```powershell
# Verificar Scheduled Task criada
Get-ScheduledTask -TaskName "CyberShieldAgent*" | Format-Table TaskName, State

# Verificar pasta de instalação
Get-ChildItem C:\CyberShield -ErrorAction SilentlyContinue

# Ver últimas linhas do log
Get-Content "C:\CyberShield\logs\agent-*.log" -Tail 20 -ErrorAction SilentlyContinue
```

#### No Dashboard CyberShield:
1. Acessar: **Admin → Monitor de Saúde** (`/admin/agent-health-monitor`)
2. Aguardar **2-3 minutos**
3. Verificar:
   - ✅ Agente aparece como **"Conectado"** (verde)
   - ✅ Último heartbeat < 5 minutos
   - ✅ Versão mostra **v3.10.26** ou superior
   - ✅ Métricas (CPU/RAM/Disco) com valores numéricos

---

## Troubleshooting

### ❌ Scheduled Task não foi criada

```powershell
# Verificar se há erros no log do instalador
Get-Content "C:\CyberShield\logs\installer-*.log" -ErrorAction SilentlyContinue

# Tentar criar manualmente (substituir NOME_DO_AGENTE)
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File C:\CyberShield\cybershield-agent-NOME_DO_AGENTE.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "CyberShieldAgent-NOME_DO_AGENTE" -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest
Start-ScheduledTask -TaskName "CyberShieldAgent-NOME_DO_AGENTE"
```

### ❌ Agente não aparece online no dashboard

1. **Verificar conectividade:**
```powershell
# Testar conexão com servidor
Test-NetConnection -ComputerName "iavbnmduxpxhwubqrzzn.supabase.co" -Port 443
```

2. **Verificar firewall:**
```powershell
# Verificar se HTTPS está liberado
Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*HTTPS*" -or $_.DisplayName -like "*443*" } | Format-Table DisplayName, Enabled, Direction
```

3. **Verificar logs de erro:**
```powershell
Get-Content "C:\CyberShield\logs\agent-*.log" -Tail 50 | Select-String -Pattern "ERROR|FAIL|401|403|500"
```

### ❌ Erro de TLS/SSL

```powershell
# Forçar TLS 1.2 antes de executar instalador
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
```

### ❌ Erro de permissão

Verificar se o PowerShell está sendo executado como **Administrador**:
```powershell
# Verificar privilégios
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Executando como Admin: $isAdmin"
```

---

## Script de Diagnóstico Completo

Executar este script para coletar informações de diagnóstico:

```powershell
Write-Host "=== DIAGNÓSTICO CYBERSHIELD ===" -ForegroundColor Cyan
Write-Host "Data/Hora: $(Get-Date)" -ForegroundColor Gray

Write-Host "`n--- SCHEDULED TASKS ---" -ForegroundColor Yellow
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Format-Table TaskName, State, TaskPath

Write-Host "`n--- PASTA DE INSTALAÇÃO ---" -ForegroundColor Yellow
if (Test-Path "C:\CyberShield") {
  Get-ChildItem "C:\CyberShield" -Recurse | Format-Table FullName, Length, LastWriteTime
} else {
  Write-Host "Pasta C:\CyberShield não existe" -ForegroundColor Red
}

Write-Host "`n--- PROCESSOS ATIVOS ---" -ForegroundColor Yellow
Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -like "*cybershield*"
} | Format-Table Id, ProcessName, StartTime

Write-Host "`n--- ÚLTIMAS LINHAS DO LOG ---" -ForegroundColor Yellow
$logs = Get-ChildItem "C:\CyberShield\logs\agent-*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($logs) {
  Get-Content $logs.FullName -Tail 30
} else {
  Write-Host "Nenhum log encontrado" -ForegroundColor Red
}

Write-Host "`n--- CONECTIVIDADE ---" -ForegroundColor Yellow
Test-NetConnection -ComputerName "iavbnmduxpxhwubqrzzn.supabase.co" -Port 443 | Format-Table ComputerName, TcpTestSucceeded

Write-Host "`n--- VERSÃO DO AGENTE ---" -ForegroundColor Yellow
$script = Get-ChildItem "C:\CyberShield\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($script) {
  $version = Select-String -Path $script.FullName -Pattern 'AGENT_VERSION\s*=\s*"([^"]+)"' | ForEach-Object { $_.Matches.Groups[1].Value }
  Write-Host "Versão instalada: $version" -ForegroundColor Green
} else {
  Write-Host "Script do agente não encontrado" -ForegroundColor Red
}
```

---

## Checklist Final de Sucesso

- [ ] Scheduled Task "CyberShieldAgent-NOME" existe e está em "Ready"
- [ ] Pasta `C:\CyberShield` existe com script e logs
- [ ] Dashboard mostra agente como **"Conectado"** (verde)
- [ ] Último heartbeat < 5 minutos
- [ ] Versão do agente é **v3.10.26** ou superior
- [ ] Métricas (CPU/RAM/Disco) mostram valores reais
- [ ] Jobs de segurança completam com sucesso

---

## Suporte

Se problemas persistirem após seguir este guia:

1. **Coletar logs:**
```powershell
Compress-Archive -Path "C:\CyberShield\logs" -DestinationPath "C:\logs-diagnostico.zip" -Force
```

2. **Enviar para suporte:**
   - Arquivo `logs-diagnostico.zip`
   - Screenshot do dashboard mostrando status do agente
   - Saída do script de diagnóstico

---

**Versão do Documento:** v3.10.26  
**Última Atualização:** Dezembro 2025
