# Testa instalador PowerShell localmente (SEM compilar para EXE)
# Uso: .\installer-validation.ps1 -InstallerPath ".\installer.ps1" -AgentToken "xxx" -HmacSecret "yyy"

param(
    [Parameter(Mandatory=$true)]
    [string]$InstallerPath,
    
    [Parameter(Mandatory=$false)]
    [string]$AgentToken,
    
    [Parameter(Mandatory=$false)]
    [string]$HmacSecret,
    
    [Parameter(Mandatory=$false)]
    [switch]$CleanupAfter = $false
)

$ErrorActionPreference = "Continue"  # Continuar mesmo com erros para ver tudo

Write-Host "🧪 Testando instalador do CyberShield Agent..." -ForegroundColor Cyan
Write-Host ""

$testResults = @{
    InstallerExists = $false
    InstallerSyntaxOK = $false
    DirectoryCreated = $false
    AgentScriptInstalled = $false
    ConfigCreated = $false
    ScheduledTaskCreated = $false
    AgentStarted = $false
}

# =============================================================================
# 1. VERIFICAR SE INSTALADOR EXISTE
# =============================================================================
Write-Host "📁 Verificando instalador..." -ForegroundColor Yellow

if (-not (Test-Path $InstallerPath)) {
    Write-Host "   ❌ Instalador não encontrado: $InstallerPath" -ForegroundColor Red
    exit 1
}

Write-Host "   ✓ Instalador existe" -ForegroundColor Green
$testResults.InstallerExists = $true

# =============================================================================
# 2. VALIDAR SINTAXE DO PS1
# =============================================================================
Write-Host ""
Write-Host "🔍 Validando sintaxe do PowerShell..." -ForegroundColor Yellow

try {
    $syntaxErrors = $null
    $null = [System.Management.Automation.PSParser]::Tokenize(
        (Get-Content $InstallerPath -Raw), 
        [ref]$syntaxErrors
    )
    
    if ($syntaxErrors.Count -eq 0) {
        Write-Host "   ✓ Sintaxe OK" -ForegroundColor Green
        $testResults.InstallerSyntaxOK = $true
    } else {
        Write-Host "   ❌ Erros de sintaxe encontrados:" -ForegroundColor Red
        $syntaxErrors | ForEach-Object {
            Write-Host "      Linha $($_.Token.StartLine): $($_.Message)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "   ⚠️  Não foi possível validar sintaxe: $_" -ForegroundColor Yellow
}

# =============================================================================
# 3. EXECUTAR INSTALADOR (modo DRY-RUN se possível)
# =============================================================================
Write-Host ""
Write-Host "🔄 Executando instalador..." -ForegroundColor Yellow
Write-Host "   (Isso pode levar alguns minutos...)" -ForegroundColor Gray
Write-Host ""

# Verificar se executando como Admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  AVISO: Não executando como Administrador" -ForegroundColor Yellow
    Write-Host "   Algumas funcionalidades podem falhar" -ForegroundColor Yellow
    Write-Host ""
}

try {
    # Executar instalador (capturar output)
    $output = & $InstallerPath 2>&1 | Tee-Object -Variable installerOutput
    
    Write-Host "   Output do instalador:" -ForegroundColor Gray
    Write-Host "   " + ("="*58) -ForegroundColor Gray
    $installerOutput | ForEach-Object {
        Write-Host "   $_" -ForegroundColor Gray
    }
    Write-Host "   " + ("="*58) -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host "   ❌ Erro ao executar instalador: $_" -ForegroundColor Red
    Write-Host ""
}

# =============================================================================
# 4. VERIFICAR SE DIRETÓRIO FOI CRIADO
# =============================================================================
Write-Host "📂 Verificando diretório de instalação..." -ForegroundColor Yellow

if (Test-Path "C:\CyberShield") {
    Write-Host "   ✓ Diretório criado: C:\CyberShield" -ForegroundColor Green
    $testResults.DirectoryCreated = $true
    
    # Listar conteúdo
    Write-Host ""
    Write-Host "   Conteúdo:" -ForegroundColor Gray
    Get-ChildItem "C:\CyberShield" -Recurse | ForEach-Object {
        $indent = "      " + ("  " * ($_.FullName.Split('\').Count - 3))
        Write-Host "$indent$($_.Name)" -ForegroundColor Gray
    }
    
} else {
    Write-Host "   ❌ Diretório NÃO foi criado" -ForegroundColor Red
}

# =============================================================================
# 5. VERIFICAR SE SCRIPT DO AGENTE FOI INSTALADO
# =============================================================================
Write-Host ""
Write-Host "📜 Verificando script do agente..." -ForegroundColor Yellow

$agentScriptPath = "C:\CyberShield\cybershield-agent.ps1"

if (Test-Path $agentScriptPath) {
    Write-Host "   ✓ Script instalado" -ForegroundColor Green
    $testResults.AgentScriptInstalled = $true
    
    $scriptSize = (Get-Item $agentScriptPath).Length / 1KB
    Write-Host "   Tamanho: $([math]::Round($scriptSize, 2)) KB" -ForegroundColor Gray
    
} else {
    Write-Host "   ❌ Script NÃO foi instalado" -ForegroundColor Red
}

# =============================================================================
# 6. VERIFICAR SE CONFIGURAÇÃO FOI CRIADA
# =============================================================================
Write-Host ""
Write-Host "⚙️  Verificando configuração..." -ForegroundColor Yellow

$configPath = "C:\CyberShield\agent_config.json"

if (Test-Path $configPath) {
    Write-Host "   ✓ Configuração criada" -ForegroundColor Green
    $testResults.ConfigCreated = $true
    
    try {
        $config = Get-Content $configPath | ConvertFrom-Json
        
        Write-Host ""
        Write-Host "   Conteúdo (sanitizado):" -ForegroundColor Gray
        Write-Host "      agent_name: $($config.agent_name)" -ForegroundColor Gray
        Write-Host "      server_url: $($config.server_url)" -ForegroundColor Gray
        Write-Host "      agent_token: $($config.agent_token.Substring(0, 8))..." -ForegroundColor Gray
        Write-Host "      hmac_secret: $($config.hmac_secret.Substring(0, 8))..." -ForegroundColor Gray
        
    } catch {
        Write-Host "   ⚠️  Erro ao ler configuração: $_" -ForegroundColor Yellow
    }
    
} else {
    Write-Host "   ❌ Configuração NÃO foi criada" -ForegroundColor Red
}

# =============================================================================
# 7. VERIFICAR SE SCHEDULED TASK FOI CRIADA
# =============================================================================
Write-Host ""
Write-Host "⏰ Verificando Scheduled Task..." -ForegroundColor Yellow

$task = Get-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "   ✓ Task criada" -ForegroundColor Green
    $testResults.ScheduledTaskCreated = $true
    
    Write-Host ""
    Write-Host "   Detalhes:" -ForegroundColor Gray
    Write-Host "      Estado: $($task.State)" -ForegroundColor Gray
    Write-Host "      Trigger: $($task.Triggers[0].Repetition.Interval)" -ForegroundColor Gray
    Write-Host "      User: $($task.Principal.UserId)" -ForegroundColor Gray
    
    # Verificar última execução
    $taskInfo = Get-ScheduledTaskInfo -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
    
    if ($taskInfo) {
        Write-Host "      Última execução: $($taskInfo.LastRunTime)" -ForegroundColor Gray
        Write-Host "      Próxima execução: $($taskInfo.NextRunTime)" -ForegroundColor Gray
        Write-Host "      Resultado: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
    }
    
} else {
    Write-Host "   ❌ Task NÃO foi criada" -ForegroundColor Red
}

# =============================================================================
# 8. VERIFICAR SE AGENTE ESTÁ RODANDO
# =============================================================================
Write-Host ""
Write-Host "🔄 Verificando se agente está ativo..." -ForegroundColor Yellow

$agentProcess = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*cybershield-agent.ps1*" }

if ($agentProcess) {
    Write-Host "   ✓ Agente está rodando (PID: $($agentProcess.Id))" -ForegroundColor Green
    $testResults.AgentStarted = $true
} else {
    Write-Host "   ⚠️  Agente não está rodando no momento" -ForegroundColor Yellow
    Write-Host "      (Pode estar configurado para rodar via Scheduled Task)" -ForegroundColor Gray
}

# =============================================================================
# 9. VERIFICAR LOGS
# =============================================================================
Write-Host ""
Write-Host "📋 Verificando logs..." -ForegroundColor Yellow

$logPath = "C:\CyberShield\logs\agent.log"

if (Test-Path $logPath) {
    Write-Host "   ✓ Arquivo de log existe" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "   Últimas 10 linhas:" -ForegroundColor Gray
    Write-Host "   " + ("-"*58) -ForegroundColor Gray
    
    Get-Content $logPath -Tail 10 | ForEach-Object {
        Write-Host "   $_" -ForegroundColor Gray
    }
    
    Write-Host "   " + ("-"*58) -ForegroundColor Gray
    
} else {
    Write-Host "   ⚠️  Arquivo de log não existe ainda" -ForegroundColor Yellow
}

# =============================================================================
# 10. LIMPEZA (se solicitado)
# =============================================================================
if ($CleanupAfter) {
    Write-Host ""
    Write-Host "🧹 Limpando instalação de teste..." -ForegroundColor Yellow
    
    # Parar Scheduled Task
    if ($task) {
        Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName "CyberShield Agent" -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "   ✓ Scheduled Task removida" -ForegroundColor Green
    }
    
    # Remover diretório
    if (Test-Path "C:\CyberShield") {
        Remove-Item "C:\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   ✓ Diretório removido" -ForegroundColor Green
    }
    
    Write-Host "   ✓ Limpeza completa" -ForegroundColor Green
}

# =============================================================================
# RESUMO FINAL
# =============================================================================
Write-Host ""
Write-Host ("="*60) -ForegroundColor Cyan

$totalTests = $testResults.Count
$passedTests = ($testResults.Values | Where-Object { $_ -eq $true }).Count

Write-Host "📊 RESUMO DOS TESTES" -ForegroundColor Cyan
Write-Host ("="*60) -ForegroundColor Cyan
Write-Host ""

$testResults.GetEnumerator() | ForEach-Object {
    $icon = if ($_.Value) { "✓" } else { "❌" }
    $color = if ($_.Value) { "Green" } else { "Red" }
    Write-Host "   $icon $($_.Key)" -ForegroundColor $color
}

Write-Host ""
Write-Host "Resultado: $passedTests/$totalTests testes passaram" -ForegroundColor $(if ($passedTests -eq $totalTests) { "Green" } else { "Yellow" })
Write-Host ("="*60) -ForegroundColor Cyan
Write-Host ""

if ($passedTests -eq $totalTests) {
    Write-Host "✅ INSTALADOR FUNCIONAL!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor Cyan
    Write-Host "1. Compilar para EXE com ps2exe" -ForegroundColor White
    Write-Host "2. Testar EXE em VM limpa" -ForegroundColor White
    Write-Host "3. Validar heartbeat no dashboard" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host "⚠️  INSTALADOR TEM PROBLEMAS" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Revise os erros acima e corrija antes de distribuir." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
