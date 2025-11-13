# Troubleshooting do Instalador CyberShield

Guia completo para diagnosticar e resolver problemas com instaladores do agente.

---

## 🔍 Diagnóstico Rápido

### Checklist Inicial
```powershell
# 1. Verificar versão do PowerShell
$PSVersionTable.PSVersion  # Deve ser >= 5.1

# 2. Verificar privilégios
([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
# Deve retornar: True

# 3. Verificar conectividade com backend
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443

# 4. Verificar política de execução
Get-ExecutionPolicy  # Se Restricted, precisa ajustar
```

---

## ❌ Problema: Instalador EXE não abre

### Sintomas
- Duplo-clique no `.exe` não faz nada
- Ou abre e fecha imediatamente (sem mensagem)
- Nenhuma janela aparece

### Causas Possíveis

#### 1. **Falta de Privilégios de Administrador**
**Solução:**
```powershell
# Executar como Admin
1. Clique direito no EXE
2. "Executar como Administrador"

# Ou via PowerShell
Start-Process -FilePath "CyberShield-Installer.exe" -Verb RunAs
```

#### 2. **Windows Defender / Antivírus Bloqueou**
**Verificar:**
```powershell
# Checar eventos do Windows Defender
Get-WinEvent -FilterHashtable @{
    LogName='Microsoft-Windows-Windows Defender/Operational'
    ID=1116,1117
} -MaxEvents 10 | Format-List
```

**Solução Temporária:**
```powershell
# Adicionar exceção (apenas para teste)
Add-MpPreference -ExclusionPath "C:\Users\Admin\Downloads\CyberShield-Installer.exe"
```

**Solução Definitiva:**
- Assinar digitalmente o EXE com certificado válido
- Ou distribuir via HTTPS com reputação estabelecida

#### 3. **EXE Corrompido (ps2exe falhou)**
**Diagnóstico:**
```powershell
# Verificar SHA256
$expected = "ABC123..."  # SHA256 do dashboard
$actual = (Get-FileHash "CyberShield-Installer.exe" -Algorithm SHA256).Hash

if ($expected -eq $actual) {
    Write-Host "✓ SHA256 OK" -ForegroundColor Green
} else {
    Write-Host "❌ EXE CORROMPIDO - Baixar novamente" -ForegroundColor Red
}
```

**Solução:**
- Baixar novamente do dashboard
- Verificar logs do build no GitHub Actions

#### 4. **Template PS1 Tinha Erros de Sintaxe**
**Testar PS1 Antes de Compilar:**
```powershell
# Se você tem o .ps1 original
powershell -NoProfile -ExecutionPolicy Bypass -File installer.ps1

# Ver erros detalhados
$Error[0] | Format-List * -Force
```

**Erros Comuns:**
- `Write-Log` chamado antes de definido → Ver seção "Agente não inicia"
- `{{PLACEHOLDER}}` não substituído → Bug no `serve-installer`
- Caracteres especiais mal escapados → Usar `@"..."@` no template

---

## ❌ Problema: Instalador roda mas agente não inicia

### Sintomas
- Instalador completa sem erros
- Mensagem "Instalação concluída com sucesso!"
- Mas `Get-ScheduledTask` mostra "Ready" (não "Running")
- Dashboard não mostra agente ativo

### Diagnóstico

#### 1. **Verificar Logs do Agente**
```powershell
# Ver últimas 50 linhas
Get-Content C:\CyberShield\logs\agent.log -Tail 50

# Buscar erros específicos
Select-String -Path C:\CyberShield\logs\agent.log -Pattern "ERROR|CRITICAL"
```

#### 2. **Tentar Iniciar Manualmente**
```powershell
# Executar agente em modo debug
C:\CyberShield\cybershield-agent.ps1 `
    -AgentToken "PASTE_TOKEN_HERE" `
    -HmacSecret "PASTE_HMAC_HERE" `
    -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co"

# Ver output completo
```

#### 3. **Verificar Scheduled Task**
```powershell
$task = Get-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "✓ Task existe" -ForegroundColor Green
    $task | Format-List *
    
    # Forçar execução
    Start-ScheduledTask -TaskName "CyberShield Agent"
    
    # Ver resultado
    Start-Sleep -Seconds 5
    Get-ScheduledTaskInfo -TaskName "CyberShield Agent"
} else {
    Write-Host "❌ Task não foi criada" -ForegroundColor Red
}
```

### Causas Comuns

#### A. **Erro: `Write-Log: termo não reconhecido`**
**Causa:** Função `Write-Log` chamada antes de ser definida no script

**Correção no `cybershield-agent-windows.ps1`:**
```powershell
# ❌ ERRADO (linha 83 - ANTES da função)
Write-Log "=== AGENTE INICIADO ===" "INFO"

function Write-Log { ... }

# ✅ CORRETO (função PRIMEIRO)
function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "DEBUG", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO"
    )
    # ... corpo da função
}

# AGORA SIM usar
Write-Log "=== AGENTE INICIADO ===" "INFO"
```

#### B. **AgentToken ou HmacSecret Inválidos**
**Sintomas nos logs:**
```
[ERROR] Failed to send heartbeat: 401 Unauthorized
[ERROR] HMAC validation failed
```

**Verificar:**
```powershell
# No instalador, conferir se valores foram passados corretamente
Get-Content C:\CyberShield\agent_config.json

# Deve conter:
# {
#   "agent_token": "uuid-valido-aqui",
#   "hmac_secret": "64-caracteres-hex-aqui"
# }
```

**Solução:**
- Gerar novo instalador no dashboard
- Verificar que enrollment key não expirou

#### C. **Firewall Bloqueando HTTPS**
**Testar conectividade:**
```powershell
# Teste básico
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443

# Teste com HTTP
Invoke-RestMethod -Uri "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/heartbeat" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"test": true}' `
    -TimeoutSec 10
```

**Solução:**
```powershell
# Adicionar regra de firewall (instalador já faz isso, mas conferir)
New-NetFirewallRule -DisplayName "CyberShield Agent HTTPS" `
    -Direction Outbound `
    -Action Allow `
    -Protocol TCP `
    -RemotePort 443 `
    -Program "C:\CyberShield\cybershield-agent.ps1"
```

#### D. **Proxy Corporativo**
**Sintomas:**
```
[ERROR] Failed to connect: ProxyError
[ERROR] Timeout after 30 seconds
```

**Solução:**
```powershell
# Adicionar configuração de proxy no agent_config.json
{
  "agent_token": "...",
  "proxy": "http://proxy.empresa.com:8080"
}

# Ou via variável de ambiente
[Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://proxy:8080", "Machine")
```

---

## ❌ Problema: Build do Python Agent Falha no GitHub Actions

### Sintomas
- Workflow `build-python-agent.yml` falha
- Erro: `ModuleNotFoundError: No module named 'requests'`

### Diagnóstico
```yaml
# Ver logs do workflow no GitHub Actions
Actions → build-python-agent → Failed run → Logs
```

### Causas e Soluções

#### 1. **Dependências não instaladas**
**Verificar step "Install dependencies":**
```yaml
- name: Install dependencies
  run: |
    python -m pip install --upgrade pip
    pip install -r agent/requirements.txt  # ✅ Caminho correto?
```

**Solução:** Adicionar dependências faltantes ao `requirements.txt`

#### 2. **PyInstaller não encontrou módulos**
**Erro:** `ModuleNotFoundError` durante execução do EXE

**Solução em `agent/build.py`:**
```python
# Adicionar módulos ocultos manualmente
cmd = [
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--hidden-import=requests",
    "--hidden-import=hmac",
    "--hidden-import=json",
    # ... outros
    "main.py"
]
```

#### 3. **agent_config.json não existe**
**Erro:** `FileNotFoundError: agent_config.json`

**Correção em `build.py`:**
```python
# ❌ ERRADO
"--add-data=agent_config.json:."

# ✅ CORRETO (usar exemplo)
"--add-data=agent_config.example.json:."
```

---

## ❌ Problema: Tabela `agent_versions` Vazia

### Sintomas
- Query `SELECT * FROM agent_versions;` retorna 0 linhas
- Edge Function `serve-installer` retorna erro 500: "No agent version found"
- Instaladores não conseguem baixar executável do agente

### Causa
Workflow `build-python-agent.yml` nunca executou com sucesso (ou nunca executou)

### Solução

#### Passo 1: Verificar Workflow
```bash
# GitHub → Actions → "Build Python Agent"
# Ver se há runs anteriores e status
```

#### Passo 2: Executar Manualmente
```
1. Ir para GitHub Actions
2. Selecionar workflow "Build Python Agent"
3. Clicar "Run workflow"
4. Branch: main
5. Input "version": 1.0.0
6. Run workflow
7. Aguardar ~5 minutos
```

#### Passo 3: Verificar Resultado
```sql
-- No Supabase SQL Editor
SELECT 
    version,
    platform,
    sha256_hash,
    file_size_bytes / 1024 / 1024 as size_mb,
    created_at
FROM agent_versions
ORDER BY created_at DESC;

-- Deve retornar 2 linhas (Windows + Linux)
```

#### Passo 4: Se Continuar Falhando
```powershell
# Build local para debug
cd agent
.\build-local.ps1

# Ver erros detalhados
```

---

## ❌ Problema: Build do Instalador EXE Fica Travado

### Sintomas
- `agent_builds` com `build_status = 'building'` há mais de 10 minutos
- Workflow GitHub Actions não completa
- Nenhum EXE é gerado

### Diagnóstico
```sql
-- Ver builds travados
SELECT 
    id,
    build_status,
    created_at,
    EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_ago
FROM agent_builds
WHERE build_status = 'building'
ORDER BY created_at DESC;
```

### Causas e Soluções

#### 1. **ps2exe Silenciosamente Falhou**
**Ver logs do workflow:**
```yaml
# .github/workflows/build-agent-exe.yml
# Procurar por:
# - "ps2exe: error"
# - "Exception"
# - "compilation failed"
```

**Solução:** Workflow já foi corrigido com retry (FASE 3.3)

#### 2. **Upload para Supabase Storage Falhou**
**Sintomas:**
```
Error: Failed to upload to storage
Supabase API returned 413 Payload Too Large
```

**Solução:**
```typescript
// Aumentar timeout no workflow
const { data, error } = await supabase.storage
    .from('agent-installers')
    .upload(fileName, fileBuffer, {
        contentType: 'application/x-msdownload',
        upsert: true,
        retries: 3  // ✅ Retry automático
    });
```

#### 3. **Callback Nunca Chegou**
**Workflow completa mas `agent_builds` não atualiza**

**Debug:**
```powershell
# Ver se callback foi enviado (nos logs do workflow)
# Procurar por: "Sending callback to Supabase"

# Verificar INTERNAL_FUNCTION_SECRET está correto
```

---

## 🛠️ Ferramentas de Debug

### Script: Validação Completa
```powershell
# Salvar como: debug-installation.ps1

param(
    [string]$AgentName = "test-agent"
)

Write-Host "🔍 CyberShield Installation Diagnostics" -ForegroundColor Cyan

# 1. Sistema
Write-Host "`n📋 System Info:" -ForegroundColor Yellow
Write-Host "  OS: $(Get-WmiObject Win32_OperatingSystem).Caption"
Write-Host "  PS Version: $($PSVersionTable.PSVersion)"
Write-Host "  Is Admin: $([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"

# 2. Arquivos
Write-Host "`n📁 Files:" -ForegroundColor Yellow
if (Test-Path "C:\CyberShield") {
    Get-ChildItem "C:\CyberShield" -Recurse | Format-Table Name, Length, LastWriteTime
} else {
    Write-Host "  ❌ C:\CyberShield não existe" -ForegroundColor Red
}

# 3. Scheduled Task
Write-Host "`n⏰ Scheduled Task:" -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "  ✓ Task existe" -ForegroundColor Green
    $task | Format-List State, LastRunTime, LastTaskResult
} else {
    Write-Host "  ❌ Task não existe" -ForegroundColor Red
}

# 4. Logs
Write-Host "`n📜 Recent Logs:" -ForegroundColor Yellow
if (Test-Path "C:\CyberShield\logs\agent.log") {
    Get-Content "C:\CyberShield\logs\agent.log" -Tail 20
} else {
    Write-Host "  ❌ Log file não existe" -ForegroundColor Red
}

# 5. Conectividade
Write-Host "`n🌐 Network:" -ForegroundColor Yellow
Test-NetConnection -ComputerName iavbnmduxpxhwubqrzzn.supabase.co -Port 443 | 
    Format-List TcpTestSucceeded, PingSucceeded

Write-Host "`n✅ Diagnóstico completo!" -ForegroundColor Green
```

---

## 📞 Quando Pedir Suporte

Se após seguir este guia o problema persistir, colete as seguintes informações:

```powershell
# Executar e enviar resultado
.\debug-installation.ps1 > diagnostics.txt

# Incluir também:
1. SHA256 do instalador baixado
2. Logs completos: C:\CyberShield\logs\agent.log
3. Screenshot do erro (se houver)
4. Versão do Windows: winver
5. Output de: Get-ScheduledTask -TaskName "CyberShield Agent" | Format-List *
```

**Canais de suporte:**
- GitHub Issues: [Criar issue](https://github.com/seu-repo/issues)
- Email: suporte@cybershield.app
- Documentação: `/docs`

---

## ✅ Checklist Final

Antes de reportar bug, confirme:

- [ ] PowerShell versão >= 5.1
- [ ] Executado como Administrador
- [ ] Antivírus não bloqueou
- [ ] SHA256 do instalador validado
- [ ] Conectividade HTTPS OK (porta 443)
- [ ] Logs do agente checados
- [ ] Scheduled Task existe e está configurada
- [ ] `agent_versions` tem dados (não vazia)
- [ ] Enrollment key não expirou
- [ ] Credenciais (token/HMAC) válidas

Se todos os itens acima estão OK e o problema persiste, é bug real! 🐛
