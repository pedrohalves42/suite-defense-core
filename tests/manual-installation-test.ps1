# CyberShield Agent - Teste Manual de Instalacao
# Este script valida todos os aspectos da instalacao do agente

#Requires -Version 3.0
#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory=$false)]
    [string]$ScriptPath = "C:\CyberShield\agent.ps1",
    
    [Parameter(Mandatory=$false)]
    [string]$LogPath = "C:\CyberShield\logs\agent.log"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  CyberShield - Teste de Instalacao do Agente" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$testResults = @{
    Passed = 0
    Failed = 0
    Warnings = 0
}

function Test-Step {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [string]$SuccessMessage,
        [string]$FailMessage,
        [switch]$Critical
    )
    
    Write-Host "[Teste] $Name..." -ForegroundColor Yellow -NoNewline
    
    try {
        $result = & $Test
        if ($result) {
            Write-Host " ? PASSOU" -ForegroundColor Green
            if ($SuccessMessage) {
                Write-Host "        $SuccessMessage" -ForegroundColor Gray
            }
            $script:testResults.Passed++
            return $true
        } else {
            Write-Host " ? FALHOU" -ForegroundColor Red
            if ($FailMessage) {
                Write-Host "        $FailMessage" -ForegroundColor Yellow
            }
            $script:testResults.Failed++
            if ($Critical) {
                Write-Host ""
                Write-Host "ERRO CRITICO: Teste essencial falhou. Abortando." -ForegroundColor Red
                exit 1
            }
            return $false
        }
    } catch {
        Write-Host " ? ERRO" -ForegroundColor Red
        Write-Host "        Erro: $($_.Exception.Message)" -ForegroundColor Yellow
        $script:testResults.Failed++
        if ($Critical) {
            Write-Host ""
            Write-Host "ERRO CRITICO: Excecao durante teste essencial. Abortando." -ForegroundColor Red
            exit 1
        }
        return $false
    }
}

Write-Host "=== 1. TESTES DE PRE-REQUISITOS ===" -ForegroundColor Cyan
Write-Host ""

# Teste 1: PowerShell Version
Test-Step `
    -Name "Versao do PowerShell" `
    -Test { $PSVersionTable.PSVersion.Major -ge 3 } `
    -SuccessMessage "PowerShell $($PSVersionTable.PSVersion) (OK)" `
    -FailMessage "PowerShell 3.0+ e necessario" `
    -Critical

# Teste 2: Privilegios Admin
Test-Step `
    -Name "Privilegios Administrativos" `
    -Test { 
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } `
    -SuccessMessage "Executando como Administrador" `
    -FailMessage "Execute este script como Administrador" `
    -Critical

# Teste 3: Sistema Operacional
Test-Step `
    -Name "Sistema Operacional Compativel" `
    -Test { 
        $osVersion = [System.Environment]::OSVersion.Version
        ($osVersion.Major -gt 6) -or ($osVersion.Major -eq 6 -and $osVersion.Minor -ge 2)
    } `
    -SuccessMessage "$($(Get-WmiObject -Class Win32_OperatingSystem).Caption)" `
    -FailMessage "Windows Server 2012+ ou Windows 8+ recomendado"

# Teste 4: .NET Framework
Test-Step `
    -Name ".NET Framework" `
    -Test { 
        $dotNetVersion = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue
        $dotNetVersion -and $dotNetVersion.Release -ge 378389
    } `
    -SuccessMessage ".NET 4.5+ disponivel" `
    -FailMessage ".NET 4.5+ recomendado para melhor desempenho"

Write-Host ""
Write-Host "=== 2. TESTES DE INSTALACAO ===" -ForegroundColor Cyan
Write-Host ""

# Teste 5: Diretorio do Agente
Test-Step `
    -Name "Diretorio C:\CyberShield existe" `
    -Test { Test-Path "C:\CyberShield" } `
    -SuccessMessage "Diretorio encontrado" `
    -FailMessage "Execute o instalador primeiro" `
    -Critical

# Teste 6: Diretorio de Logs
Test-Step `
    -Name "Diretorio de Logs existe" `
    -Test { Test-Path "C:\CyberShield\logs" } `
    -SuccessMessage "Diretorio de logs OK" `
    -FailMessage "Pasta de logs nao foi criada"

# Teste 7: Script do Agente
Test-Step `
    -Name "Script do agente existe" `
    -Test { Test-Path $ScriptPath } `
    -SuccessMessage "Script encontrado: $ScriptPath" `
    -FailMessage "Script do agente nao foi instalado" `
    -Critical

# Teste 8: Validar sintaxe do script
Test-Step `
    -Name "Sintaxe do script PowerShell" `
    -Test { 
        $errors = $null
        $null = [System.Management.Automation.PSParser]::Tokenize((Get-Content $ScriptPath -Raw), [ref]$errors)
        $errors.Count -eq 0
    } `
    -SuccessMessage "Sintaxe valida" `
    -FailMessage "Erros de sintaxe detectados no script"

Write-Host ""
Write-Host "=== 3. TESTES DE TAREFA AGENDADA ===" -ForegroundColor Cyan
Write-Host ""

# Teste 9: Tarefa existe
$task = Get-ScheduledTask -TaskName "CyberShieldAgent" -ErrorAction SilentlyContinue

Test-Step `
    -Name "Tarefa agendada existe" `
    -Test { $null -ne $task } `
    -SuccessMessage "Tarefa 'CyberShieldAgent' encontrada" `
    -FailMessage "Tarefa nao foi criada no Task Scheduler" `
    -Critical

if ($task) {
    # Teste 10: Tarefa esta habilitada
    Test-Step `
        -Name "Tarefa esta habilitada" `
        -Test { $task.State -ne 'Disabled' } `
        -SuccessMessage "Estado: $($task.State)" `
        -FailMessage "Tarefa esta desabilitada"
    
    # Teste 11: Trigger configurado
    Test-Step `
        -Name "Trigger de inicializacao configurado" `
        -Test { $task.Triggers.Count -gt 0 } `
        -SuccessMessage "$($task.Triggers.Count) trigger(s) configurado(s)" `
        -FailMessage "Nenhum trigger configurado"
    
    # Teste 12: Executando como SYSTEM
    Test-Step `
        -Name "Executando como SYSTEM" `
        -Test { $task.Principal.UserId -eq "SYSTEM" } `
        -SuccessMessage "Configurado corretamente como SYSTEM" `
        -FailMessage "Nao esta executando como SYSTEM"
    
    # Teste 13: RunLevel Highest
    Test-Step `
        -Name "Privilegios elevados (Highest)" `
        -Test { $task.Principal.RunLevel -eq "Highest" } `
        -SuccessMessage "RunLevel: $($task.Principal.RunLevel)" `
        -FailMessage "RunLevel nao esta configurado como Highest"
    
    # Teste 14: Ultima execucao
    if ($task.LastRunTime -gt (Get-Date).AddDays(-1)) {
        Test-Step `
            -Name "Tarefa foi executada recentemente" `
            -Test { $true } `
            -SuccessMessage "Ultima execucao: $($task.LastRunTime)"
    } else {
        Test-Step `
            -Name "Tarefa foi executada recentemente" `
            -Test { $false } `
            -FailMessage "Ultima execucao: $($task.LastRunTime) - Muito antiga ou nunca executou"
    }
    
    # Teste 15: Resultado da ultima execucao
    if ($task.LastTaskResult -eq 0) {
        Test-Step `
            -Name "Ultima execucao bem-sucedida" `
            -Test { $true } `
            -SuccessMessage "LastTaskResult: 0x0 (Sucesso)"
    } else {
        Test-Step `
            -Name "Ultima execucao bem-sucedida" `
            -Test { $false } `
            -FailMessage "LastTaskResult: 0x$([Convert]::ToString($task.LastTaskResult, 16))"
    }
}

Write-Host ""
Write-Host "=== 4. TESTES DE LOGS ===" -ForegroundColor Cyan
Write-Host ""

# Teste 16: Arquivo de log existe
Test-Step `
    -Name "Arquivo de log existe" `
    -Test { Test-Path $LogPath } `
    -SuccessMessage "Log encontrado: $LogPath" `
    -FailMessage "Arquivo de log nao existe - agente pode nao ter executado"

if (Test-Path $LogPath) {
    # Teste 17: Log tem conteudo
    Test-Step `
        -Name "Log tem conteudo" `
        -Test { (Get-Content $LogPath).Count -gt 0 } `
        -SuccessMessage "$($(Get-Content $LogPath).Count) linhas no log" `
        -FailMessage "Arquivo de log esta vazio"
    
    # Teste 18: Log recente (ultima hora)
    Test-Step `
        -Name "Log foi atualizado recentemente" `
        -Test { (Get-Item $LogPath).LastWriteTime -gt (Get-Date).AddHours(-1) } `
        -SuccessMessage "Ultima atualizacao: $((Get-Item $LogPath).LastWriteTime)" `
        -FailMessage "Log nao foi atualizado na ultima hora"
    
    # Teste 19: Sem erros criticos no log
    $logContent = Get-Content $LogPath -Raw
    Test-Step `
        -Name "Sem erros criticos no log" `
        -Test { -not ($logContent -match '\[ERROR\].*critical|CRITICAL ERROR|FATAL') } `
        -SuccessMessage "Nenhum erro critico detectado" `
        -FailMessage "Erros criticos encontrados no log"
    
    # Exibir ultimas 10 linhas do log
    Write-Host ""
    Write-Host "Ultimas 10 linhas do log:" -ForegroundColor Gray
    Write-Host "?????????????????????????????????????????????" -ForegroundColor DarkGray
    Get-Content $LogPath -Tail 10 | ForEach-Object {
        $color = "White"
        if ($_ -match '\[ERROR\]') { $color = "Red" }
        elseif ($_ -match '\[WARN\]') { $color = "Yellow" }
        elseif ($_ -match '\[SUCCESS\]') { $color = "Green" }
        Write-Host "  $_" -ForegroundColor $color
    }
    Write-Host "?????????????????????????????????????????????" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "=== 5. TESTES DE CONECTIVIDADE ===" -ForegroundColor Cyan
Write-Host ""

# Teste 20: Porta 443 acessivel
Test-Step `
    -Name "Conectividade HTTPS (porta 443)" `
    -Test { 
        $connection = Test-NetConnection -ComputerName "iavbnmduxpxhwubqrzzn.supabase.co" -Port 443 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        $connection.TcpTestSucceeded
    } `
    -SuccessMessage "Servidor Supabase acessivel" `
    -FailMessage "Nao foi possivel conectar ao servidor - verifique firewall"

# Teste 21: DNS resolve
Test-Step `
    -Name "Resolucao DNS" `
    -Test { 
        $null -ne (Resolve-DnsName -Name "iavbnmduxpxhwubqrzzn.supabase.co" -ErrorAction SilentlyContinue)
    } `
    -SuccessMessage "DNS resolvendo corretamente" `
    -FailMessage "Falha na resolucao DNS"

# Teste 22: TLS 1.2 disponivel
Test-Step `
    -Name "TLS 1.2 disponivel" `
    -Test { 
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $true
    } `
    -SuccessMessage "TLS 1.2 suportado" `
    -FailMessage "TLS 1.2 nao esta disponivel"

Write-Host ""
Write-Host "=== 6. TESTES DE SERVICOS DO SISTEMA ===" -ForegroundColor Cyan
Write-Host ""

# Teste 23: Task Scheduler Service
Test-Step `
    -Name "Servico Task Scheduler ativo" `
    -Test { 
        $service = Get-Service -Name "Schedule" -ErrorAction SilentlyContinue
        $service -and $service.Status -eq "Running"
    } `
    -SuccessMessage "Servico Task Scheduler OK" `
    -FailMessage "Task Scheduler nao esta rodando"

# Teste 24: Windows Event Log disponivel
Test-Step `
    -Name "Windows Event Log disponivel" `
    -Test { 
        $null -ne (Get-EventLog -List | Where-Object {$_.Log -eq "Application"})
    } `
    -SuccessMessage "Event Log acessivel" `
    -FailMessage "Event Log nao esta acessivel"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  RESUMO DOS TESTES" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "? Passou:  $($testResults.Passed) teste(s)" -ForegroundColor Green
Write-Host "? Falhou:  $($testResults.Failed) teste(s)" -ForegroundColor Red
Write-Host "[WARN]  Avisos:  $($testResults.Warnings) teste(s)" -ForegroundColor Yellow
Write-Host ""

$totalTests = $testResults.Passed + $testResults.Failed + $testResults.Warnings
$successRate = [math]::Round(($testResults.Passed / $totalTests) * 100, 1)

Write-Host "Taxa de sucesso: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })
Write-Host ""

if ($testResults.Failed -eq 0) {
    Write-Host "? Todos os testes passaram! Agente instalado corretamente." -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Cyan
    Write-Host "  1. Verifique o dashboard web para confirmar status 'Online'" -ForegroundColor White
    Write-Host "  2. Aguarde 60s para primeiro heartbeat aparecer" -ForegroundColor White
    Write-Host "  3. Teste criar um job no dashboard" -ForegroundColor White
    Write-Host ""
    exit 0
} else {
    Write-Host "[WARN]  Alguns testes falharam. Revise os itens acima." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Dicas de troubleshooting:" -ForegroundColor Cyan
    Write-Host "  - Verifique logs: Get-Content '$LogPath' -Tail 50" -ForegroundColor White
    Write-Host "  - Inicie tarefa manualmente: Start-ScheduledTask -TaskName 'CyberShieldAgent'" -ForegroundColor White
    Write-Host "  - Verifique firewall: Test-NetConnection iavbnmduxpxhwubqrzzn.supabase.co -Port 443" -ForegroundColor White
    Write-Host "  - Execute agente manualmente para debug:" -ForegroundColor White
    Write-Host "    powershell -ExecutionPolicy Bypass -File '$ScriptPath' -AgentToken 'TOKEN' -HmacSecret 'SECRET' -ServerUrl 'URL'" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
