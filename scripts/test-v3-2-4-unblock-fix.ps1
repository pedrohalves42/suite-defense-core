#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Script de validacao completa do fix v3.2.4-UNBLOCK-FIX
    
.DESCRIPTION
    Este script executa todas as 5 fases do plano de teste:
    1. Limpa instalacao anterior
    2. Valida versao do instalador
    3. Executa instalador
    4. Valida execucao do agente
    5. Mostra instrucoes para verificar dashboard
    
.PARAMETER EnrollmentKey
    Chave de enrollment gerada no dashboard (formato: XXXX-XXXX-XXXX-XXXX)
    
.PARAMETER AgentName
    Nome do agente a ser criado (ex: teste-fix)
    
.EXAMPLE
    .\test-v3-2-4-unblock-fix.ps1 -EnrollmentKey "XXXX-XXXX-XXXX-XXXX" -AgentName "test-agent"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$EnrollmentKey,
    
    [Parameter(Mandatory=$true)]
    [string]$AgentName
)

$ErrorActionPreference = "Stop"
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
$BaseDir = "C:\CyberShield"
$LogFile = "$BaseDir\logs\test-validation.log"

function Write-TestLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    if (Test-Path $BaseDir) {
        Add-Content -Path $LogFile -Value $logMessage -ErrorAction SilentlyContinue
    }
}

function Test-Phase {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [string]$SuccessMessage,
        [string]$FailureMessage
    )
    
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "FASE: $Name" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    try {
        $result = & $Test
        if ($result) {
            Write-Host "[OK]  $SuccessMessage" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[ERROR]  $FailureMessage" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "[ERROR]  ERRO: $($_.Exception.Message)" -ForegroundColor Red
        Write-TestLog "ERRO na fase '$Name': $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================================
# FASE 1: LIMPEZA
# ============================================================
$phase1 = Test-Phase -Name "1/5 - Limpeza de Instalacao Anterior" -Test {
    Write-TestLog "Iniciando limpeza..."
    
    # Parar e remover Scheduled Task
    $taskName = "CyberShieldAgent"
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Write-TestLog "Parando e removendo Scheduled Task '$taskName'..."
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-TestLog "Scheduled Task removida"
    }
    
    # Parar processos PowerShell relacionados ao agente
    $agentProcesses = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | 
        Where-Object { $_.CommandLine -like "*cybershield-agent*" }
    
    if ($agentProcesses) {
        Write-TestLog "Parando $($agentProcesses.Count) processo(s) do agente..."
        $agentProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    # Limpar logs antigos
    if (Test-Path $BaseDir) {
        Write-TestLog "Limpando logs antigos..."
        Remove-Item "$BaseDir\logs\*.log" -Force -ErrorAction SilentlyContinue
        Remove-Item "$BaseDir\logs\*.txt" -Force -ErrorAction SilentlyContinue
    }
    
    Write-TestLog "Limpeza concluida"
    return $true
} -SuccessMessage "Instalacao anterior limpa com sucesso" -FailureMessage "Falha na limpeza"

if (-not $phase1) {
<<<<<<< HEAD
    Write-Host "`n[WARN]  Aviso: Limpeza falhou, mas continuando..." -ForegroundColor Yellow
=======
    Write-Host "`n[WARN] ? Aviso: Limpeza falhou, mas continuando..." -ForegroundColor Yellow
>>>>>>> 221a634 (fix(ascii): remove caracteres nao-ASCII de scripts criticos)
}

# ============================================================
# FASE 2: VALIDACAO DA VERSAO DO INSTALADOR
# ============================================================
$phase2 = Test-Phase -Name "2/5 - Validacao da Versao do Instalador" -Test {
    Write-TestLog "Verificando versao do instalador..."
    
    $installerUrl = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey"
    Write-TestLog "URL: $installerUrl"
    
    try {
        $response = Invoke-WebRequest -Uri $installerUrl -UseBasicParsing -ErrorAction Stop
        $content = $response.Content
        
        Write-TestLog "Resposta recebida: $($content.Length) bytes"
        
        # Verificar versao
        if ($content -match 'v3\.2\.4-UNBLOCK-FIX') {
            Write-TestLog "Versao v3.2.4-UNBLOCK-FIX confirmada"
            Write-Host "   Versao: v3.2.4-UNBLOCK-FIX [OK] " -ForegroundColor Green
            
            # Verificar presenca de Unblock-File
            if ($content -match 'Unblock-File') {
                Write-Host "   Unblock-File: Presente [OK] " -ForegroundColor Green
            } else {
                Write-Host "   Unblock-File: AUSENTE [ERROR] " -ForegroundColor Red
                return $false
            }
            
            # Verificar remocao manual de Zone.Identifier
            if ($content -match 'Zone\.Identifier') {
                Write-Host "   Zone.Identifier Removal: Presente [OK] " -ForegroundColor Green
            } else {
                Write-Host "   Zone.Identifier Removal: AUSENTE [ERROR] " -ForegroundColor Red
                return $false
            }
            
            # Verificar ExecutionPolicy Unrestricted
            if ($content -match 'Unrestricted') {
                Write-Host "   ExecutionPolicy Unrestricted: Presente [OK] " -ForegroundColor Green
            } else {
                Write-Host "   ExecutionPolicy Unrestricted: AUSENTE [ERROR] " -ForegroundColor Red
                return $false
            }
            
            return $true
        } else {
            Write-TestLog "ERRO: Versao incorreta detectada" "ERROR"
            Write-Host "   Versao esperada: v3.2.4-UNBLOCK-FIX" -ForegroundColor Red
            Write-Host "   Versao encontrada: $(if ($content -match 'v\d+\.\d+\.\d+[^\s]*') { $matches[0] } else { 'Desconhecida' })" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-TestLog "ERRO ao buscar instalador: $($_.Exception.Message)" "ERROR"
        throw
    }
} -SuccessMessage "Instalador v3.2.4-UNBLOCK-FIX validado com sucesso" -FailureMessage "Versao do instalador incorreta ou incompleta"

if (-not $phase2) {
    Write-Host "`n[ERROR]  TESTE ABORTADO: Instalador nao possui o fix necessario" -ForegroundColor Red
    Write-Host "   Por favor, aguarde o redeploy completo do Edge Function" -ForegroundColor Yellow
    exit 1
}

# ============================================================
# FASE 3: EXECUCAO DO INSTALADOR
# ============================================================
$phase3 = Test-Phase -Name "3/5 - Execucao do Instalador" -Test {
    Write-TestLog "Baixando e executando instalador..."
    
    $installerUrl = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey"
    $installerScript = Invoke-RestMethod -Uri $installerUrl -Method Get -ErrorAction Stop
    
    Write-TestLog "Instalador baixado: $($installerScript.Length) bytes"
    
    # Executar instalador
    Write-TestLog "Executando instalador..."
    $installerBlock = [ScriptBlock]::Create($installerScript)
    & $installerBlock
    
    Write-TestLog "Instalador executado"
    Start-Sleep -Seconds 5
    
    return $true
} -SuccessMessage "Instalador executado com sucesso" -FailureMessage "Falha na execucao do instalador"

if (-not $phase3) {
    Write-Host "`n[ERROR]  TESTE ABORTADO: Instalador falhou" -ForegroundColor Red
    exit 1
}

# ============================================================
# FASE 4: VALIDACAO DA EXECUCAO DO AGENTE
# ============================================================
Write-Host "`n? Aguardando 30 segundos para o agente iniciar..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

$phase4 = Test-Phase -Name "4/5 - Validacao da Execucao do Agente" -Test {
    Write-TestLog "Validando execucao do agente..."
    
    $agentLogPath = "$BaseDir\logs\cybershield-agent-v3.log"
    
    if (-not (Test-Path $agentLogPath)) {
        Write-Host "   [ERROR]  Log do agente nao encontrado: $agentLogPath" -ForegroundColor Red
        return $false
    }
    
    $logContent = Get-Content $agentLogPath -Tail 100 -ErrorAction Stop
    Write-TestLog "Log do agente lido: $($logContent.Count) linhas"
    
    # Verificacoes criticas
    $checks = @{
        "Inicializacao" = "\[START\] Iniciando CyberShield Agent"
        "Bootstrap" = "\[SUCCESS\] Bootstrap concluido"
        "Loop Principal" = "Entrando no loop principal"
        "Heartbeat" = "\[HEARTBEAT\] Heartbeat enviado com sucesso \(200\)"
    }
    
    $allPassed = $true
    foreach ($check in $checks.GetEnumerator()) {
        if ($logContent -match $check.Value) {
            Write-Host "   [OK]  $($check.Key): OK" -ForegroundColor Green
        } else {
            Write-Host "   [ERROR]  $($check.Key): FALHOU" -ForegroundColor Red
            $allPassed = $false
        }
    }
    
    # Verificar se ha erros 401
    if ($logContent -match "401|Unauthorized") {
        Write-Host "   [ERROR]  ERRO: Encontrados erros de autenticacao (401)" -ForegroundColor Red
        $allPassed = $false
    } else {
        Write-Host "   [OK]  Sem erros de autenticacao" -ForegroundColor Green
    }
    
    if ($allPassed) {
        Write-Host "`n[DOC]  Ultimas 10 linhas do log:" -ForegroundColor Cyan
        $logContent | Select-Object -Last 10 | ForEach-Object { Write-Host "   $_" }
    }
    
    return $allPassed
} -SuccessMessage "Agente executando corretamente! ?" -FailureMessage "Agente NAO esta executando como esperado"

# ============================================================
# FASE 5: INSTRUCOES PARA DASHBOARD
# ============================================================
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "FASE: 5/5 - Verificacao no Dashboard" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Por favor, acesse o dashboard e verifique:" -ForegroundColor Yellow
Write-Host "   1. Status do agente '$AgentName': Deve estar 'Online' (verde)" -ForegroundColor White
Write-Host "   2. Ultimo Heartbeat: Deve ser < 1 minuto" -ForegroundColor White
Write-Host "   3. Badge 'Completo' (verde) no timeline" -ForegroundColor White

# ============================================================
# RESUMO FINAL
# ============================================================
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "RESUMO DO TESTE" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

$totalPhases = 4
$passedPhases = @($phase1, $phase2, $phase3, $phase4) | Where-Object { $_ -eq $true }
$passedCount = $passedPhases.Count

Write-Host "Fases Concluidas: $passedCount/$totalPhases" -ForegroundColor $(if ($passedCount -eq $totalPhases) { "Green" } else { "Yellow" })

if ($phase4) {
    Write-Host "`n? SUCESSO! O fix v3.2.4-UNBLOCK-FIX esta funcionando!" -ForegroundColor Green
    Write-Host "   O agente esta executando corretamente e enviando heartbeats." -ForegroundColor Green
    Write-Host "   Verifique o dashboard para confirmar o status 'Online'." -ForegroundColor Green
} else {
<<<<<<< HEAD
    Write-Host "`n[WARN]  FALHA PARCIAL" -ForegroundColor Yellow
=======
    Write-Host "`n[WARN] ? FALHA PARCIAL" -ForegroundColor Yellow
>>>>>>> 221a634 (fix(ascii): remove caracteres nao-ASCII de scripts criticos)
    Write-Host "   Logs completos salvos em: $LogFile" -ForegroundColor White
    Write-Host "`nDiagnostico:" -ForegroundColor Cyan
    
    if (-not $phase2) {
        Write-Host "   - O instalador NAO possui o fix v3.2.4-UNBLOCK-FIX" -ForegroundColor Red
        Write-Host "   - Aguarde o redeploy completo e tente novamente" -ForegroundColor Yellow
    } elseif (-not $phase3) {
        Write-Host "   - O instalador falhou ao executar" -ForegroundColor Red
        Write-Host "   - Verifique: $BaseDir\logs\installer.log" -ForegroundColor Yellow
    } elseif (-not $phase4) {
        Write-Host "   - O agente NAO iniciou corretamente" -ForegroundColor Red
        Write-Host "   - Possiveis causas:" -ForegroundColor Yellow
        Write-Host "     1. Zone.Identifier ainda presente (verifique installer.log)" -ForegroundColor White
        Write-Host "     2. ExecutionPolicy bloqueando (verifique Event Viewer)" -ForegroundColor White
        Write-Host "     3. Erro de parsing do PowerShell 5.1" -ForegroundColor White
        Write-Host "`n   Tente execucao manual:" -ForegroundColor Cyan
        Write-Host "   powershell.exe -ExecutionPolicy Unrestricted -File `"C:\CyberShield\cybershield-agent-$AgentName.ps1`"" -ForegroundColor White
    }
}

Write-Host "`n========================================`n" -ForegroundColor Magenta
