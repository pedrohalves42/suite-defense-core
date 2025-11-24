<#
.SYNOPSIS
    CyberShield Installer Log Analyzer

.DESCRIPTION
    Analisa automaticamente o installer.log e gera relatorio com problemas detectados.

.PARAMETER LogPath
    Caminho do arquivo installer.log. Padrao: C:\CyberShield\logs\installer.log

.EXAMPLE
    .\analyze-installer-log.ps1 -LogPath "C:\CyberShield\logs\installer.log"
#>

param(
    [string]$LogPath = "C:\CyberShield\logs\installer.log"
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path $LogPath)) {
    Write-Host "[ERRO] Arquivo de log nao encontrado: $LogPath" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== CyberShield Installer Log Analyzer ===" -ForegroundColor Cyan
Write-Host "Log: $LogPath" -ForegroundColor Gray
Write-Host ""

# Ler conteudo do log
$logContent = Get-Content $LogPath -Raw -Encoding UTF8

# ============================================
# 1. Informacoes Basicas
# ============================================
Write-Host ">> Informacoes Basicas:" -ForegroundColor Yellow

# Versao do instalador
if ($logContent -match "Versao do Instalador:\s*(.+)") {
    $version = $matches[1].Trim()
    Write-Host "  Versao: $version" -ForegroundColor White
} else {
    Write-Host "  Versao: NAO DETECTADA" -ForegroundColor Red
}

# Usuario
if ($logContent -match "Usuario:\s*(.+)") {
    $user = $matches[1].Trim()
    Write-Host "  Usuario: $user" -ForegroundColor White
}

# PowerShell Version
if ($logContent -match "PowerShell Version:\s*(.+)") {
    $psVersion = $matches[1].Trim()
    Write-Host "  PowerShell: $psVersion" -ForegroundColor White
}

# Timestamp
if ($logContent -match "Timestamp:\s*(.+)") {
    $timestamp = $matches[1].Trim()
    Write-Host "  Timestamp: $timestamp" -ForegroundColor White
}

Write-Host ""

# ============================================
# 2. Diagnostico de Seguranca
# ============================================
Write-Host ">> Diagnostico de Seguranca:" -ForegroundColor Yellow

$hasSecurityIssues = $false

# ExecutionPolicy - MachinePolicy
if ($logContent -match "ExecutionPolicy \[MachinePolicy\]:\s*(.+)") {
    $machinePolicy = $matches[1].Trim()
    
    if ($machinePolicy -in @("AllSigned", "Restricted")) {
        Write-Host "  MachinePolicy: $machinePolicy" -ForegroundColor Red
        Write-Host "    [CRITICO] GPO forcando ExecutionPolicy restritiva" -ForegroundColor Red
        Write-Host "    Solucao: Assinar scripts OU migrar para EXE" -ForegroundColor Yellow
        $hasSecurityIssues = $true
    } elseif ($machinePolicy -eq "Undefined") {
        Write-Host "  MachinePolicy: $machinePolicy (OK)" -ForegroundColor Green
    } else {
        Write-Host "  MachinePolicy: $machinePolicy" -ForegroundColor White
    }
}

# LanguageMode
if ($logContent -match "LanguageMode:\s*(.+)") {
    $langMode = $matches[1].Trim()
    
    if ($langMode -ne "FullLanguage") {
        Write-Host "  LanguageMode: $langMode" -ForegroundColor Red
        Write-Host "    [CRITICO] LanguageMode restrito (Device Guard/WDAC)" -ForegroundColor Red
        Write-Host "    Impacto: Funcionalidades .NET e crypto podem falhar" -ForegroundColor Yellow
        $hasSecurityIssues = $true
    } else {
        Write-Host "  LanguageMode: $langMode (OK)" -ForegroundColor Green
    }
}

if (-not $hasSecurityIssues) {
    Write-Host "  STATUS: Nenhum problema de seguranca detectado" -ForegroundColor Green
}

Write-Host ""

# ============================================
# 3. Unblock-File e Zone.Identifier
# ============================================
Write-Host ">> Unblock-File e Zone.Identifier:" -ForegroundColor Yellow

if ($logContent -match "Script desbloqueado com sucesso") {
    Write-Host "  Unblock-File: OK" -ForegroundColor Green
} elseif ($logContent -match "Falha ao desbloquear arquivo") {
    Write-Host "  Unblock-File: FALHOU" -ForegroundColor Red
    if ($logContent -match "Falha ao desbloquear arquivo:\s*(.+)") {
        $unblockError = $matches[1].Trim()
        Write-Host "    Erro: $unblockError" -ForegroundColor Yellow
    }
}

if ($logContent -match "Zone.Identifier NAO encontrado apos Unblock-File") {
    Write-Host "  Zone.Identifier: Removido com sucesso (OK)" -ForegroundColor Green
} elseif ($logContent -match "Zone.Identifier ainda presente") {
    Write-Host "  Zone.Identifier: AINDA PRESENTE" -ForegroundColor Red
    Write-Host "    [CRITICO] Sistema nao permite remover ADS" -ForegroundColor Red
    Write-Host "    Solucao: Assinar scripts OU migrar para EXE" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# 4. Criacao da Scheduled Task
# ============================================
Write-Host ">> Scheduled Task:" -ForegroundColor Yellow

if ($logContent -match "Scheduled Task '(.+)' criada com sucesso") {
    $taskName = $matches[1]
    Write-Host "  Task: $taskName (Criada)" -ForegroundColor Green
    
    # Last Task Result
    if ($logContent -match "Last Task Result:\s*(\d+)") {
        $taskResult = [int]$matches[1]
        
        if ($taskResult -eq 0) {
            Write-Host "  Last Result: $taskResult (OK - Sucesso)" -ForegroundColor Green
        } else {
            Write-Host "  Last Result: $taskResult (ERRO)" -ForegroundColor Red
            
            # Decodificar erro comum
            switch ($taskResult) {
                1 { Write-Host "    Erro: Erro generico (argumentos ou sintaxe do script)" -ForegroundColor Yellow }
                267009 { Write-Host "    Erro: Task nao pôde ser executada" -ForegroundColor Yellow }
                default { Write-Host "    Erro: Codigo de erro desconhecido" -ForegroundColor Yellow }
            }
        }
    }
} elseif ($logContent -match "Falha ao criar Scheduled Task") {
    Write-Host "  Task: FALHOU NA CRIACAO" -ForegroundColor Red
}

Write-Host ""

# ============================================
# 5. Validacao de Execucao do Agent
# ============================================
Write-Host ">> Execucao do Agent:" -ForegroundColor Yellow

$agentStarted = $false
$bootstrapCompleted = $false
$loopActive = $false
$heartbeatSent = $false
$has401Error = $false

if ($logContent -match "\[START\] Iniciando CyberShield Agent") {
    $agentStarted = $true
    Write-Host "  Agent Iniciou: SIM" -ForegroundColor Green
} else {
    Write-Host "  Agent Iniciou: NAO" -ForegroundColor Red
    Write-Host "    [PROBLEMA] Agent nunca executou" -ForegroundColor Red
    Write-Host "    Verificar: ExecutionPolicy, sintaxe do script, Task arguments" -ForegroundColor Yellow
}

if ($logContent -match "\[SUCCESS\] Bootstrap concluido") {
    $bootstrapCompleted = $true
    Write-Host "  Bootstrap: Concluido" -ForegroundColor Green
} elseif ($agentStarted) {
    Write-Host "  Bootstrap: NAO CONCLUIDO" -ForegroundColor Red
}

if ($logContent -match "\[INFO\] Entrando no loop principal") {
    $loopActive = $true
    Write-Host "  Loop Principal: Ativo" -ForegroundColor Green
} elseif ($agentStarted) {
    Write-Host "  Loop Principal: NAO INICIADO" -ForegroundColor Red
}

if ($logContent -match "\[HEARTBEAT\] Heartbeat enviado com sucesso" -or $logContent -match "\[SUCCESS\] Heartbeat OK \(200\)") {
    $heartbeatSent = $true
    Write-Host "  Heartbeat: Enviado (200)" -ForegroundColor Green
} elseif ($agentStarted) {
    Write-Host "  Heartbeat: NAO ENVIADO" -ForegroundColor Red
}

if ($logContent -match "401") {
    $has401Error = $true
    Write-Host "  Erro 401: DETECTADO" -ForegroundColor Red
    Write-Host "    [PROBLEMA] Autenticacao falhou" -ForegroundColor Red
    Write-Host "    Verificar: AgentToken, HmacSecret, sincronizacao de relogio" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# 6. Erros Criticos Detectados
# ============================================
Write-Host ">> Erros Criticos:" -ForegroundColor Yellow

$criticalErrors = @()

# Procurar por erros de sintaxe
if ($logContent -match "InvalidVariableReferenceWithDrive") {
    $criticalErrors += "InvalidVariableReferenceWithDrive: Sintaxe PowerShell invalida"
}

if ($logContent -match "ParserError") {
    $criticalErrors += "ParserError: Erro de parse no script"
}

if ($logContent -match "PSSecurityException") {
    $criticalErrors += "PSSecurityException: Script bloqueado por politica de seguranca"
}

if ($logContent -match "The term .+ is not recognized") {
    if ($logContent -match "The term '(.+)' is not recognized") {
        $term = $matches[1]
        $criticalErrors += "Funcao nao reconhecida: $term"
    }
}

if ($criticalErrors.Count -gt 0) {
    foreach ($error in $criticalErrors) {
        Write-Host "  [ERRO] $error" -ForegroundColor Red
    }
} else {
    Write-Host "  Nenhum erro critico detectado no log" -ForegroundColor Green
}

Write-Host ""

# ============================================
# 7. Resumo e Recomendacoes
# ============================================
Write-Host "=== RESUMO ===" -ForegroundColor Cyan
Write-Host ""

$totalIssues = 0

if ($hasSecurityIssues) {
    $totalIssues++
    Write-Host "[PROBLEMA] Restricoes de seguranca detectadas (GPO/LanguageMode)" -ForegroundColor Red
}

if (-not $agentStarted) {
    $totalIssues++
    Write-Host "[PROBLEMA] Agent nunca iniciou execucao" -ForegroundColor Red
}

if ($has401Error) {
    $totalIssues++
    Write-Host "[PROBLEMA] Erro de autenticacao (401)" -ForegroundColor Red
}

if ($criticalErrors.Count -gt 0) {
    $totalIssues++
    Write-Host "[PROBLEMA] Erros criticos de sintaxe ou parse" -ForegroundColor Red
}

if ($totalIssues -eq 0) {
    Write-Host "[SUCESSO] Instalacao aparenta estar funcional!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Yellow
    Write-Host "  1. Verificar dashboard para confirmar agent online" -ForegroundColor White
    Write-Host "  2. Monitorar logs por 5-10 minutos" -ForegroundColor White
} else {
    Write-Host "[FALHA] $totalIssues problema(s) detectado(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Yellow
    
    if ($hasSecurityIssues) {
        Write-Host "  1. Executar diagnose-executionpolicy.ps1 para analise detalhada" -ForegroundColor White
        Write-Host "  2. Considerar Fase 3: Assinatura de scripts ou migracao para EXE" -ForegroundColor White
    }
    
    if (-not $agentStarted) {
        Write-Host "  1. Verificar sintaxe do script do agent" -ForegroundColor White
        Write-Host "  2. Verificar argumentos da Scheduled Task" -ForegroundColor White
        Write-Host "  3. Executar agent manualmente para ver erros" -ForegroundColor White
    }
    
    if ($has401Error) {
        Write-Host "  1. Regenerar credenciais do agent" -ForegroundColor White
        Write-Host "  2. Verificar sincronizacao de relogio do servidor" -ForegroundColor White
        Write-Host "  3. Confirmar HMAC secret em formato hex (64 chars)" -ForegroundColor White
    }
}

Write-Host ""
