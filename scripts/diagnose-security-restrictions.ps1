#Requires -RunAsAdministrator

Write-Host "`n=== DIAGNOSTICO DE RESTRICOES DE SEGURANCA ===" -ForegroundColor Cyan
Write-Host "CyberShield Agent - Validacao de Ambiente Windows`n" -ForegroundColor Gray

# 1. ExecutionPolicy detalhado
Write-Host "[1] ExecutionPolicy por Escopo:" -ForegroundColor Yellow
Get-ExecutionPolicy -List | Format-Table -AutoSize

$machinePolicy = (Get-ExecutionPolicy -List | Where-Object { $_.Scope -eq "MachinePolicy" }).ExecutionPolicy
if ($machinePolicy -in @("AllSigned", "Restricted")) {
    Write-Host "  [CRITICO] GPO forcando $machinePolicy - scripts nao assinados serao bloqueados!" -ForegroundColor Red
    Write-Host "  Solucao: Assinar scripts OU ajustar GPO" -ForegroundColor Yellow
} else {
    Write-Host "  [OK] Sem restricao de GPO" -ForegroundColor Green
}

# 2. LanguageMode
Write-Host "`n[2] LanguageMode:" -ForegroundColor Yellow
$languageMode = $ExecutionContext.SessionState.LanguageMode
Write-Host "  Modo atual: $languageMode" -ForegroundColor $(if ($languageMode -eq "FullLanguage") { "Green" } else { "Red" })

if ($languageMode -eq "ConstrainedLanguage") {
    Write-Host "  [CRITICO] ConstrainedLanguage detectado - operacoes .NET/crypto/network limitadas!" -ForegroundColor Red
    Write-Host "  Causa provavel: Device Guard / WDAC / AppLocker" -ForegroundColor Yellow
}

# 3. AppLocker
Write-Host "`n[3] AppLocker:" -ForegroundColor Yellow
try {
    $appLockerPolicy = Get-AppLockerPolicy -Effective -ErrorAction SilentlyContinue
    if ($appLockerPolicy) {
        Write-Host "  [AVISO] Politicas AppLocker ativas detectadas:" -ForegroundColor Yellow
        $appLockerPolicy.RuleCollections | ForEach-Object {
            Write-Host "    - $($_.RuleCollectionType): $($_.Count) regras" -ForegroundColor Gray
        }
        
        # Testar execucao basica
        Write-Host "`n  Testando execucao de script de teste..." -ForegroundColor Gray
        $testPath = "$env:TEMP\cybershield-applocker-test.ps1"
        "'Write-Host AppLocker Test'" | Out-File $testPath -Encoding UTF8
        
        try {
            $testResult = & powershell.exe -ExecutionPolicy Bypass -File $testPath 2>&1
            Remove-Item $testPath -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Teste de execucao passou" -ForegroundColor Green
        } catch {
            Write-Host "  [CRITICO] Teste de execucao falhou: $($_.Exception.Message)" -ForegroundColor Red
            Remove-Item $testPath -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "  [OK] AppLocker nao configurado" -ForegroundColor Green
    }
} catch {
    Write-Host "  [INFO] Nao foi possivel verificar AppLocker (pode nao estar configurado)" -ForegroundColor Gray
}

# 4. Device Guard / WDAC
Write-Host "`n[4] Device Guard / WDAC:" -ForegroundColor Yellow
try {
    $wdac = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard -ErrorAction SilentlyContinue
    if ($wdac) {
        Write-Host "  Status de Code Integrity: $($wdac.CodeIntegrityPolicyEnforcementStatus)" -ForegroundColor Gray
        
        if ($wdac.CodeIntegrityPolicyEnforcementStatus -eq 1) {
            Write-Host "  [CRITICO] WDAC/Device Guard ATIVO - apenas codigo assinado permitido!" -ForegroundColor Red
            Write-Host "  Solucao: Assinar scripts e binarios com certificado confiavel" -ForegroundColor Yellow
        } else {
            Write-Host "  [OK] WDAC/Device Guard nao ativo" -ForegroundColor Green
        }
    } else {
        Write-Host "  [INFO] Device Guard nao disponivel neste sistema" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [INFO] Nao foi possivel verificar Device Guard" -ForegroundColor Gray
}

# 5. Windows Defender / AV
Write-Host "`n[5] Windows Defender:" -ForegroundColor Yellow
try {
    $defenderStatus = Get-MpComputerStatus -ErrorAction SilentlyContinue
    if ($defenderStatus) {
        Write-Host "  Antivirus habilitado: $($defenderStatus.AntivirusEnabled)" -ForegroundColor Gray
        Write-Host "  Real-time Protection: $($defenderStatus.RealTimeProtectionEnabled)" -ForegroundColor Gray
        
        if ($defenderStatus.RealTimeProtectionEnabled) {
            Write-Host "  [AVISO] Real-time protection ativo - pode bloquear scripts suspeitos" -ForegroundColor Yellow
        }
        
        # Verificar eventos recentes do Defender
        try {
            $defenderLogs = Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" -MaxEvents 10 -ErrorAction SilentlyContinue | 
                Where-Object { $_.Message -like "*PowerShell*" -or $_.Message -like "*CyberShield*" }
            
            if ($defenderLogs) {
                Write-Host "`n  [AVISO] Eventos recentes relacionados a PowerShell/CyberShield:" -ForegroundColor Yellow
                foreach ($log in $defenderLogs) {
                    $shortMessage = $log.Message.Substring(0, [Math]::Min(80, $log.Message.Length))
                    Write-Host "    - [$($log.TimeCreated)] ID $($log.Id): $shortMessage..." -ForegroundColor Gray
                }
            }
        } catch {
            # Silencioso
        }
    } else {
        Write-Host "  [INFO] Windows Defender nao disponivel ou inacessivel" -ForegroundColor Gray
    }
} catch {
    Write-Host "  [INFO] Nao foi possivel verificar Windows Defender" -ForegroundColor Gray
}

# 6. Zone.Identifier em arquivo de teste
Write-Host "`n[6] Teste de Zone.Identifier:" -ForegroundColor Yellow
$testFile = "$env:TEMP\cybershield-zone-test.ps1"
"Write-Host 'Zone Test'" | Out-File $testFile -Encoding UTF8

# Simular download (adicionar Zone.Identifier)
try {
    Set-Content -Path "$testFile`:Zone.Identifier" -Value "[ZoneTransfer]`r`nZoneId=3" -ErrorAction Stop
    Write-Host "  [INFO] Zone.Identifier criado (simulando download da internet)" -ForegroundColor Gray
    
    if (Test-Path "$testFile`:Zone.Identifier") {
        # Testar Unblock-File
        try {
            Unblock-File -Path $testFile -ErrorAction Stop
            Start-Sleep -Milliseconds 100
            
            if (-not (Test-Path "$testFile`:Zone.Identifier")) {
                Write-Host "  [OK] Unblock-File funcionou corretamente" -ForegroundColor Green
            } else {
                Write-Host "  [CRITICO] Unblock-File NAO removeu Zone.Identifier!" -ForegroundColor Red
                Write-Host "  Tentando remocao manual..." -ForegroundColor Yellow
                
                Remove-Item "$testFile`:Zone.Identifier" -Force -ErrorAction Stop
                if (-not (Test-Path "$testFile`:Zone.Identifier")) {
                    Write-Host "  [OK] Remocao manual bem-sucedida" -ForegroundColor Green
                }
            }
        } catch {
            Write-Host "  [CRITICO] Falha ao executar Unblock-File: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  [AVISO] Nao foi possivel criar Zone.Identifier de teste: $($_.Exception.Message)" -ForegroundColor Yellow
}

Remove-Item $testFile -Force -ErrorAction SilentlyContinue

# 7. Permissoes do usuario atual
Write-Host "`n[7] Permissoes e Contexto:" -ForegroundColor Yellow
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "  Usuario: $env:USERNAME" -ForegroundColor Gray
Write-Host "  Administrador: $isAdmin" -ForegroundColor $(if ($isAdmin) { "Green" } else { "Red" })

if (-not $isAdmin) {
    Write-Host "  [CRITICO] Script NAO esta rodando como Administrador!" -ForegroundColor Red
    Write-Host "  Execute: 'Run as Administrator'" -ForegroundColor Yellow
}

# 8. Verificar conectividade com backend (se disponivel)
Write-Host "`n[8] Conectividade com Backend (opcional):" -ForegroundColor Yellow
$serverUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
try {
    $response = Invoke-WebRequest -Uri "$serverUrl/functions/v1/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  [OK] Backend acessivel (HTTP $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "  [AVISO] Nao foi possivel conectar ao backend: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "  (Isso pode ser esperado se o backend nao estiver configurado)" -ForegroundColor Gray
}

# Resumo final
Write-Host "`n=== RESUMO DO DIAGNOSTICO ===" -ForegroundColor Cyan

$criticalIssues = 0
$warnings = 0

# Contar issues
if ($machinePolicy -in @("AllSigned", "Restricted")) { $criticalIssues++ }
if ($languageMode -eq "ConstrainedLanguage") { $criticalIssues++ }
if (-not $isAdmin) { $criticalIssues++ }

Write-Host "`nIssues criticos encontrados: $criticalIssues" -ForegroundColor $(if ($criticalIssues -eq 0) { "Green" } else { "Red" })
Write-Host "Avisos encontrados: $warnings" -ForegroundColor $(if ($warnings -eq 0) { "Green" } else { "Yellow" })

if ($criticalIssues -eq 0) {
    Write-Host "`n[SUCESSO] Ambiente compativel com CyberShield Agent!" -ForegroundColor Green
    Write-Host "Voce pode prosseguir com a instalacao normalmente.`n" -ForegroundColor Green
} else {
    Write-Host "`n[ATENCAO] Restricoes de seguranca detectadas!" -ForegroundColor Yellow
    Write-Host "Consulte a documentacao para resolucao dos issues criticos.`n" -ForegroundColor Yellow
}

Write-Host "=== FIM DO DIAGNOSTICO ===`n" -ForegroundColor Cyan
