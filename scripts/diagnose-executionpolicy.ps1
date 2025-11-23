#Requires -RunAsAdministrator
<#
.SYNOPSIS
    CyberShield ExecutionPolicy Diagnostic Tool

.DESCRIPTION
    Diagnostica problemas de ExecutionPolicy, LanguageMode, Zone.Identifier e GPO
    que podem impedir a execucao de scripts PowerShell do CyberShield Agent.

.PARAMETER OutputPath
    Caminho do arquivo de log. Padrao: C:\CyberShield\logs\executionpolicy-diagnose.log

.EXAMPLE
    Set-ExecutionPolicy Bypass -Scope Process -Force
    .\diagnose-executionpolicy.ps1
#>

param(
    [string]$OutputPath = "C:\CyberShield\logs\executionpolicy-diagnose.log"
)

$ErrorActionPreference = "Continue"

# Garantir diretorio de log
$logDir = Split-Path $OutputPath -Parent
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Limpar log anterior
if (Test-Path $OutputPath) {
    Remove-Item $OutputPath -Force
}

function Write-Diag {
    param([string]$Message)

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[{0}] {1}" -f $timestamp, $Message
    Write-Host $line
    $line | Out-File -FilePath $OutputPath -Append -Encoding UTF8
}

Write-Diag "=== CyberShield ExecutionPolicy Diagnose ==="
Write-Diag ""
Write-Diag "User: $(whoami)"
Write-Diag "Host: $env:COMPUTERNAME"
Write-Diag "PSVersion: $($PSVersionTable.PSVersion.ToString())"
Write-Diag "PSEdition: $($PSVersionTable.PSEdition)"
Write-Diag ""

# ============================================
# 1. ExecutionPolicy por escopo
# ============================================
Write-Diag ">> ExecutionPolicy -List:"
try {
    $policies = Get-ExecutionPolicy -List
    
    $hasMachinePolicy = $false
    $hasUserPolicy = $false
    
    foreach ($p in $policies) {
        $scope = $p.Scope
        $policy = $p.ExecutionPolicy
        
        Write-Diag "  {0,-15} {1}" -f $scope, $policy
        
        if ($scope -eq "MachinePolicy" -and $policy -ne "Undefined") {
            $hasMachinePolicy = $true
            if ($policy -in @("AllSigned", "Restricted")) {
                Write-Diag ""
                Write-Diag "  AVISO CRITICO: GPO forcando ExecutionPolicy=$policy"
                Write-Diag "  Solucao: Scripts devem ser assinados OU migrar para EXE"
                Write-Diag ""
            }
        }
        
        if ($scope -eq "UserPolicy" -and $policy -ne "Undefined") {
            $hasUserPolicy = $true
            if ($policy -in @("AllSigned", "Restricted")) {
                Write-Diag ""
                Write-Diag "  AVISO: UserPolicy forcando ExecutionPolicy=$policy"
                Write-Diag ""
            }
        }
    }
    
    if (-not $hasMachinePolicy -and -not $hasUserPolicy) {
        Write-Diag ""
        Write-Diag "  STATUS: Sem GPO detectado. ExecutionPolicy pode ser alterada via parametro."
        Write-Diag ""
    }
} catch {
    Write-Diag "ERRO ao obter ExecutionPolicy: $($_.Exception.Message)"
}
Write-Diag ""

# ============================================
# 2. LanguageMode
# ============================================
Write-Diag ">> LanguageMode:"
try {
    $mode = $ExecutionContext.SessionState.LanguageMode
    Write-Diag "  LanguageMode: $mode"
    
    if ($mode -ne "FullLanguage") {
        Write-Diag ""
        Write-Diag "  AVISO CRITICO: LanguageMode restrito ($mode)"
        Write-Diag "  Causa provavel: Device Guard / WDAC / AppLocker"
        Write-Diag "  Impacto: Funcionalidades .NET e crypto podem falhar"
        Write-Diag ""
    } else {
        Write-Diag "  STATUS: OK - FullLanguage permitido"
    }
} catch {
    Write-Diag "ERRO ao obter LanguageMode: $($_.Exception.Message)"
}
Write-Diag ""

# ============================================
# 3. Teste de Unblock-File e Zone.Identifier
# ============================================
$tmpScriptPath = Join-Path $env:TEMP "cs-executionpolicy-test.ps1"
Write-Diag ">> Criando script de teste em: $tmpScriptPath"

@'
Write-Output "[OK] Script de teste executado com sucesso."
Write-Output "[INFO] LanguageMode: $($ExecutionContext.SessionState.LanguageMode)"
Write-Output "[INFO] ExecutionPolicy (escopo corrente): $(Get-ExecutionPolicy)"
'@ | Out-File -FilePath $tmpScriptPath -Encoding UTF8 -Force

# Simular "arquivo baixado" adicionando Zone.Identifier
Write-Diag ">> Tentando simular Zone.Identifier (marca arquivo como baixado)..."
try {
    $zoneContent = '[ZoneTransfer]' + "`r`n" + 'ZoneId=3'
    Set-Content -Path "$tmpScriptPath`:Zone.Identifier" -Value $zoneContent -Encoding ASCII -ErrorAction Stop
    Write-Diag "  Zone.Identifier criado com sucesso."
} catch {
    Write-Diag "  Aviso: falha ao criar Zone.Identifier: $($_.Exception.Message)"
}

# Verificar se Zone.Identifier existe
Write-Diag ""
Write-Diag ">> Verificando Zone.Identifier antes do Unblock:"
try {
    $zoneStream = Get-Item -Path $tmpScriptPath -Stream Zone.Identifier -ErrorAction SilentlyContinue
    if ($zoneStream) {
        Write-Diag "  Zone.Identifier PRESENTE (arquivo marcado como baixado)"
    } else {
        Write-Diag "  Zone.Identifier NAO encontrado"
    }
} catch {
    Write-Diag "  Erro ao verificar Zone.Identifier: $($_.Exception.Message)"
}

# Teste de Unblock-File
Write-Diag ""
Write-Diag ">> Testando Unblock-File:"
try {
    Unblock-File -Path $tmpScriptPath -ErrorAction Stop
    Write-Diag "  Unblock-File executado com sucesso."
} catch {
    Write-Diag "  ERRO ao executar Unblock-File: $($_.Exception.Message)"
    Write-Diag "  Impacto: Scripts baixados podem ser bloqueados automaticamente"
}

# Verificar se Zone.Identifier foi removido
Write-Diag ""
Write-Diag ">> Verificando Zone.Identifier apos Unblock:"
try {
    $zoneStream = Get-Item -Path $tmpScriptPath -Stream Zone.Identifier -ErrorAction SilentlyContinue
    if ($zoneStream) {
        Write-Diag "  CRITICO: Zone.Identifier ainda PRESENTE apos Unblock-File"
        Write-Diag "  Sistema nao permite remocao de ADS. Scripts podem ser bloqueados."
    } else {
        Write-Diag "  OK: Zone.Identifier removido com sucesso"
    }
} catch {
    Write-Diag "  Zone.Identifier NAO encontrado (OK)"
}
Write-Diag ""

# ============================================
# 4. Teste de execucao com diferentes politicas
# ============================================
$exe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

foreach ($policy in @("Bypass", "Unrestricted")) {
    Write-Diag ">> Testando execucao com -ExecutionPolicy $policy:"
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $exe
        $psi.Arguments = "-ExecutionPolicy $policy -NoProfile -File `"$tmpScriptPath`""
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError  = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true

        $proc = [System.Diagnostics.Process]::Start($psi)
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()

        Write-Diag "  ExitCode: $($proc.ExitCode)"
        
        if ($proc.ExitCode -eq 0) {
            Write-Diag "  STATUS: OK - Script executado com sucesso"
        } else {
            Write-Diag "  STATUS: FALHA - Script nao executou (ExitCode: $($proc.ExitCode))"
        }
        
        if ($stdout.Trim()) {
            Write-Diag "  STDOUT:"
            $stdout.Trim().Split("`n") | ForEach-Object { Write-Diag "    $_" }
        }
        if ($stderr.Trim()) {
            Write-Diag "  STDERR:"
            $stderr.Trim().Split("`n") | ForEach-Object { Write-Diag "    $_" }
        }
    } catch {
        Write-Diag "  ERRO ao executar teste com $policy: $($_.Exception.Message)"
    }
    Write-Diag ""
}

# ============================================
# 5. Teste de execucao direta (sem -ExecutionPolicy)
# ============================================
Write-Diag ">> Testando execucao direta (sem -ExecutionPolicy flag):"
try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exe
    $psi.Arguments = "-NoProfile -File `"$tmpScriptPath`""
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    Write-Diag "  ExitCode: $($proc.ExitCode)"
    
    if ($proc.ExitCode -eq 0) {
        Write-Diag "  STATUS: OK - Script executado sem flag -ExecutionPolicy"
    } else {
        Write-Diag "  STATUS: BLOQUEADO - Executar scripts requer -ExecutionPolicy flag"
    }
    
    if ($stderr.Trim()) {
        Write-Diag "  STDERR:"
        $stderr.Trim().Split("`n") | ForEach-Object { Write-Diag "    $_" }
    }
} catch {
    Write-Diag "  ERRO: $($_.Exception.Message)"
}
Write-Diag ""

# ============================================
# 6. Resumo e Recomendacoes
# ============================================
Write-Diag "=== RESUMO DO DIAGNOSTICO ==="
Write-Diag ""

$criticalIssues = 0
$warnings = 0

# Analisar resultados
$execPolicy = (Get-ExecutionPolicy -List | Where-Object { $_.Scope -eq "MachinePolicy" }).ExecutionPolicy
if ($execPolicy -in @("AllSigned", "Restricted")) {
    $criticalIssues++
    Write-Diag "[CRITICO] GPO forcando ExecutionPolicy=$execPolicy"
    Write-Diag "  Solucao: Assinar scripts com certificado de codigo OU migrar para EXE"
    Write-Diag ""
}

$langMode = $ExecutionContext.SessionState.LanguageMode
if ($langMode -ne "FullLanguage") {
    $criticalIssues++
    Write-Diag "[CRITICO] LanguageMode restrito: $langMode"
    Write-Diag "  Solucao: Migrar para EXE compilado assinado"
    Write-Diag ""
}

# Verificar se Zone.Identifier persiste
try {
    $zoneStream = Get-Item -Path $tmpScriptPath -Stream Zone.Identifier -ErrorAction SilentlyContinue
    if ($zoneStream) {
        $warnings++
        Write-Diag "[AVISO] Zone.Identifier nao pode ser removido"
        Write-Diag "  Impacto: Scripts baixados podem ser bloqueados"
        Write-Diag ""
    }
} catch {}

if ($criticalIssues -eq 0 -and $warnings -eq 0) {
    Write-Diag "[OK] Nenhum problema critico detectado!"
    Write-Diag "[OK] Sistema compativel com instalacao padrao do CyberShield Agent"
} elseif ($criticalIssues -gt 0) {
    Write-Diag "[FALHA] $criticalIssues problema(s) critico(s) detectado(s)"
    Write-Diag "[RECOMENDACAO] Contate suporte para implementar Fase 3 (Enterprise)"
} else {
    Write-Diag "[AVISO] $warnings aviso(s) detectado(s)"
    Write-Diag "[RECOMENDACAO] Instalacao pode funcionar, mas monitorar logs"
}

Write-Diag ""
Write-Diag "Diagnostico concluido. Log salvo em: $OutputPath"
Write-Diag ""
Write-Diag "Proximos passos:"
Write-Diag "  1. Enviar este log para analise"
Write-Diag "  2. Executar instalador CyberShield e verificar logs"
Write-Diag "  3. Se houver problemas, aplicar solucoes recomendadas acima"

# Cleanup
if (Test-Path $tmpScriptPath) {
    Remove-Item $tmpScriptPath -Force -ErrorAction SilentlyContinue
}
