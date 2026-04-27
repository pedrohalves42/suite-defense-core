# ============================================
# SCRIPT DE TESTE COMPLETO - AGENTE testev2
# Versao do Instalador: v3.3.0-SECURITY-DIAGNOSTICS
# ============================================
# 
# Este script realiza um teste end-to-end completo:
# 1. Limpeza de instalacoes anteriores
# 2. Validacao da versao e funcionalidades do instalador
# 3. Execucao do instalador
# 4. Validacao de logs do agente
# 5. Confirmacao de heartbeat
#
# NOVAS FUNCIONALIDADES v3.3.0:
# - Diagnostico avancado de restricoes de seguranca
# - Deteccao de GPO (ExecutionPolicy AllSigned/Restricted)
# - Deteccao de Constrained Language Mode
# - Teste de AppLocker
# - Verificacao de Device Guard / WDAC
# - Monitoramento de eventos do Windows Defender
# ============================================

#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Script de Validacao Completa v3.2.4-UNBLOCK-FIX - Agent testev2
.DESCRIPTION
    Testa o fix completo com credenciais pre-preenchidas
    - Limpeza automatica
    - Validacao de versao
    - Execucao do instalador
    - Validacao de execucao do agente
.NOTES
    Credenciais: PRE-PREENCHIDAS (testev2)
    Versao: 1.0.0
    Data: 2025-01-23
#>

param(
    [string]$EnrollmentKey = "XXXX-XXXX-XXXX-XXXX",
    [string]$AgentName = "test-agent",
    [string]$ServerUrl = "https://your-project.supabase.co",
    [string]$AgentToken = "00000000-0000-0000-0000-000000000000",
    [string]$HmacSecret = "0000000000000000000000000000000000000000000000000000000000000000"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  TESTE v3.2.4-UNBLOCK-FIX - Agent testev2" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "[INFO] Credenciais PRE-PREENCHIDAS:" -ForegroundColor Yellow
Write-Host "  - Agent Name: $AgentName" -ForegroundColor Gray
Write-Host "  - Enrollment Key: $EnrollmentKey" -ForegroundColor Gray
Write-Host "  - Server URL: $ServerUrl" -ForegroundColor Gray
Write-Host ""

# ============================================
# FASE 1: LIMPEZA
# ============================================
Write-Host "[FASE 1] Limpando instalacoes anteriores..." -ForegroundColor Yellow

# Parar e remover Scheduled Tasks
$tasks = Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue
foreach ($task in $tasks) {
    Write-Host "  Removendo task: $($task.TaskName)" -ForegroundColor Gray
    Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
}

# Matar processos do agente
Get-Process -Name "*powershell*" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*cybershield-agent*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Limpar logs antigos
if (Test-Path "C:\CyberShield\logs") {
    Remove-Item "C:\CyberShield\logs\*" -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Logs antigos removidos" -ForegroundColor Green
}

Write-Host "[OK] Limpeza concluida`n" -ForegroundColor Green

# ============================================
# FASE 2: VALIDAR VERSAO DO INSTALADOR
# ============================================
Write-Host "[FASE 2] Validando versao do instalador..." -ForegroundColor Yellow

$installerUrl = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey"
try {
    $response = Invoke-WebRequest -Uri $installerUrl -UseBasicParsing -ErrorAction Stop
    $installerContent = $response.Content
    
    # Verificar versao
    if ($installerContent -match "v3\.3\.0-SECURITY-DIAGNOSTICS") {
        Write-Host "  [OK] Versao do instalador: v3.3.0-SECURITY-DIAGNOSTICS" -ForegroundColor Green
    } else {
        Write-Host "  [ERRO] Versao incorreta ou ausente!" -ForegroundColor Red
        Write-Host "  Buscando por v3.3.0-SECURITY-DIAGNOSTICS" -ForegroundColor Yellow
        Write-Host "  Conteudo (primeiras 500 chars):" -ForegroundColor Gray
        Write-Host $installerContent.Substring(0, [Math]::Min(500, $installerContent.Length)) -ForegroundColor Gray
        exit 1
    }
    
    # Verificar Unblock-File
    if ($installerContent -match "Unblock-File") {
        Write-Host "  [OK] Instalador contem Unblock-File" -ForegroundColor Green
    } else {
        Write-Host "  [ERRO] Unblock-File ausente!" -ForegroundColor Red
        exit 1
    }
    
    # Verificar remocao de Zone.Identifier
    if ($installerContent -match "Zone\.Identifier") {
        Write-Host "  [OK] Instalador contem remocao de Zone.Identifier" -ForegroundColor Green
    } else {
        Write-Host "  [ERRO] Logica de Zone.Identifier ausente!" -ForegroundColor Red
        exit 1
    }
    
    # Verificar ExecutionPolicy Unrestricted
    if ($installerContent -match "ExecutionPolicy.*Unrestricted") {
        Write-Host "  [OK] Instalador usa ExecutionPolicy Unrestricted" -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] ExecutionPolicy pode nao estar configurado como Unrestricted" -ForegroundColor Yellow
    }
    
    # NOVO: Verificar diagnostico de seguranca (Fase 2)
    if ($installerContent -match "Diagnostico de Restricoes de Seguranca") {
        Write-Host "  [OK] Instalador contem diagnostico de seguranca avancado" -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] Diagnostico de seguranca pode estar ausente" -ForegroundColor Yellow
    }
    
    # NOVO: Verificar deteccao de GPO
    if ($installerContent -match "MachinePolicy") {
        Write-Host "  [OK] Instalador detecta GPO (ExecutionPolicy)" -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] Deteccao de GPO pode estar ausente" -ForegroundColor Yellow
    }
    
    # NOVO: Verificar deteccao de LanguageMode
    if ($installerContent -match "LanguageMode") {
        Write-Host "  [OK] Instalador detecta LanguageMode (Constrained Language)" -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] Deteccao de LanguageMode pode estar ausente" -ForegroundColor Yellow
    }
    
    # NOVO: Verificar deteccao de AppLocker
    if ($installerContent -match "AppLocker") {
        Write-Host "  [OK] Instalador detecta AppLocker" -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] Deteccao de AppLocker pode estar ausente" -ForegroundColor Yellow
    }
    
    # NOVO: Verificar deteccao de Device Guard/WDAC
    if ($installerContent -match "Device Guard|WDAC") {
        Write-Host "  [OK] Instalador detecta Device Guard/WDAC" -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] Deteccao de Device Guard pode estar ausente" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "  [ERRO] Falha ao buscar instalador: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Validacao de versao concluida`n" -ForegroundColor Green

# ============================================
# FASE 3: EXECUTAR INSTALADOR
# ============================================
Write-Host "[FASE 3] Executando instalador..." -ForegroundColor Yellow

try {
    # Criar diretorio temporario
    $tempDir = "C:\Temp\CyberShield"
    if (-not (Test-Path $tempDir)) {
        New-Item -Path $tempDir -ItemType Directory -Force | Out-Null
    }
    
    # Salvar instalador
    $installerPath = "$tempDir\installer-testev2.ps1"
    $installerContent | Out-File -FilePath $installerPath -Encoding UTF8 -Force
    
    # Executar instalador
    Write-Host "  Executando: $installerPath" -ForegroundColor Gray
    $installerOutput = & powershell.exe -ExecutionPolicy Bypass -File $installerPath 2>&1
    
    # Exibir output
    Write-Host "`n--- OUTPUT DO INSTALADOR ---" -ForegroundColor Cyan
    $installerOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "--- FIM DO OUTPUT ---`n" -ForegroundColor Cyan
    
    # Verificar se criou a Scheduled Task
    $taskExists = Get-ScheduledTask -TaskName "CyberShield Agent - $AgentName" -ErrorAction SilentlyContinue
    if ($taskExists) {
        Write-Host "  [OK] Scheduled Task criada com sucesso" -ForegroundColor Green
    } else {
        Write-Host "  [ERRO] Scheduled Task nao foi criada!" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "  [ERRO] Falha ao executar instalador: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Instalador executado com sucesso`n" -ForegroundColor Green

# ============================================
# FASE 4: VALIDAR EXECUCAO DO AGENTE
# ============================================
Write-Host "[FASE 4] Validando execucao do agente..." -ForegroundColor Yellow
Write-Host "  Aguardando 60 segundos para o agente iniciar..." -ForegroundColor Gray

Start-Sleep -Seconds 60

$agentLogPath = "C:\CyberShield\logs\cybershield-agent-v3.log"

if (-not (Test-Path $agentLogPath)) {
    Write-Host "  [ERRO] Log do agente nao encontrado em: $agentLogPath" -ForegroundColor Red
    Write-Host "  Verificando arquivos em C:\CyberShield\logs:" -ForegroundColor Gray
    Get-ChildItem "C:\CyberShield\logs" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "    - $($_.Name)" -ForegroundColor Gray
    }
    exit 1
}

# Ler log do agente
$agentLog = Get-Content $agentLogPath -Raw -ErrorAction SilentlyContinue

if (-not $agentLog) {
    Write-Host "  [ERRO] Log do agente esta vazio!" -ForegroundColor Red
    exit 1
}

# Exibir log completo
Write-Host "`n--- LOG DO AGENTE (ultimas 50 linhas) ---" -ForegroundColor Cyan
Get-Content $agentLogPath -Tail 50 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host "--- FIM DO LOG ---`n" -ForegroundColor Cyan

# Verificacoes criticas
$checks = @{
    "[START] Iniciando CyberShield Agent" = $false
    "[SUCCESS] Bootstrap concluido" = $false
    "[INFO] Entrando no loop principal" = $false
    "[HEARTBEAT] Heartbeat enviado com sucesso" = $false
}

foreach ($pattern in $checks.Keys) {
    if ($agentLog -match [regex]::Escape($pattern)) {
        Write-Host "  [OK] $pattern" -ForegroundColor Green
        $checks[$pattern] = $true
    } else {
        Write-Host "  [ERRO] $pattern - NAO ENCONTRADO" -ForegroundColor Red
    }
}

# Verificar erros 401
if ($agentLog -match "401") {
    Write-Host "  [ERRO] Erro 401 (Unauthorized) detectado!" -ForegroundColor Red
    Write-Host "  Verifique as credenciais do agente." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "  [OK] Nenhum erro 401 detectado" -ForegroundColor Green
}

# Resultado final
$allPassed = $true
foreach ($value in $checks.Values) {
    if (-not $value) {
        $allPassed = $false
        break
    }
}

Write-Host ""
if ($allPassed) {
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  [SUCESSO] Agente $AgentName FUNCIONANDO!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Yellow
    Write-Host "  1. Abra o dashboard: $ServerUrl" -ForegroundColor Gray
    Write-Host "  2. Va para 'Agents' no menu lateral" -ForegroundColor Gray
    Write-Host "  3. Verifique o agente '$AgentName':" -ForegroundColor Gray
    Write-Host "     - Status: 'Online' (verde)" -ForegroundColor Gray
    Write-Host "     - Ultimo Heartbeat: < 1 minuto" -ForegroundColor Gray
    Write-Host "     - Badge 'Completo' no timeline" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "============================================" -ForegroundColor Red
    Write-Host "  [FALHA] Agente NAO esta funcionando!" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Diagnostico:" -ForegroundColor Yellow
    Write-Host "  1. Verifique o log completo acima" -ForegroundColor Gray
    Write-Host "  2. Procure por mensagens de erro especificas" -ForegroundColor Gray
    Write-Host "  3. Verifique se o script foi desbloqueado corretamente" -ForegroundColor Gray
    Write-Host "  4. Execute manualmente:" -ForegroundColor Gray
    Write-Host "     cd C:\CyberShield" -ForegroundColor Gray
    Write-Host "     powershell.exe -ExecutionPolicy Unrestricted -File '.\cybershield-agent-$AgentName.ps1' -ServerUrl '$ServerUrl' -AgentToken '$AgentToken' -HmacSecret '$HmacSecret' -AgentName '$AgentName'" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
