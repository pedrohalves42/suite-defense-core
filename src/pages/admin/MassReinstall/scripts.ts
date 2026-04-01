export const CLEANUP_SCRIPT = `# =========================================
# CyberShield - Script de Limpeza Completa
# Execute como Administrador no PowerShell
# =========================================

Write-Host "=== CyberShield Cleanup Script ===" -ForegroundColor Cyan

# 1. Parar Scheduled Tasks
Write-Host "[1/4] Parando e removendo Scheduled Tasks..." -ForegroundColor Yellow
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "    Removido: $($_.TaskName)" -ForegroundColor Gray
}

# 2. Parar processos do agente
Write-Host "[2/4] Parando processos..." -ForegroundColor Yellow
Get-Process -Name "powershell*" -ErrorAction SilentlyContinue | Where-Object { 
    $_.CommandLine -like "*cybershield*" -or $_.CommandLine -like "*CyberShield*" 
} | Stop-Process -Force -ErrorAction SilentlyContinue

# 3. Remover pasta de instalação
Write-Host "[3/4] Removendo pasta C:\\\\CyberShield..." -ForegroundColor Yellow
if (Test-Path "C:\\\\CyberShield") {
    Remove-Item -Path "C:\\\\CyberShield" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    Pasta removida com sucesso" -ForegroundColor Green
} else {
    Write-Host "    Pasta não encontrada (já removida)" -ForegroundColor Gray
}

# 4. Limpar registros temporários
Write-Host "[4/4] Limpando arquivos temporários..." -ForegroundColor Yellow
Remove-Item -Path "$env:TEMP\\\\install-windows*" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:TEMP\\\\cybershield*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Limpeza Concluída ===" -ForegroundColor Green
Write-Host ""
Write-Host "PROXIMO PASSO: Execute o comando de reinstalacao abaixo" -ForegroundColor Cyan
Write-Host ""
`;

export const DIAGNOSTIC_SCRIPT = `# =========================================
# CyberShield - Script de Diagnóstico
# Execute como Administrador no PowerShell
# =========================================

Write-Host "=== CyberShield Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# Verificar pasta de instalação
Write-Host "[1] Pasta de Instalação:" -ForegroundColor Yellow
if (Test-Path "C:\\\\CyberShield") {
    $files = Get-ChildItem "C:\\\\CyberShield" -File -ErrorAction SilentlyContinue
    Write-Host "    Pasta existe com $($files.Count) arquivos" -ForegroundColor Green
    $files | ForEach-Object { Write-Host "    - $($_.Name) ($([math]::Round($_.Length/1KB, 2)) KB)" -ForegroundColor Gray }
} else {
    Write-Host "    Pasta NAO encontrada" -ForegroundColor Red
}

# Verificar Scheduled Tasks
Write-Host ""
Write-Host "[2] Scheduled Tasks:" -ForegroundColor Yellow
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    $tasks | ForEach-Object { 
        Write-Host "    - $($_.TaskName): $($_.State)" -ForegroundColor $(if($_.State -eq 'Running'){'Green'}elseif($_.State -eq 'Ready'){'Yellow'}else{'Red'})
    }
} else {
    Write-Host "    Nenhuma task encontrada" -ForegroundColor Red
}

# Verificar versão do agente
Write-Host ""
Write-Host "[3] Versão do Agente:" -ForegroundColor Yellow
$scriptFiles = Get-ChildItem "C:\\\\CyberShield\\\\*.ps1" -ErrorAction SilentlyContinue
if ($scriptFiles) {
    foreach ($script in $scriptFiles) {
        $content = Get-Content $script.FullName -Raw -ErrorAction SilentlyContinue
        if ($content -match 'Version:\\s*([\\w\\d\\.-]+)') {
            Write-Host "    $($script.Name): $($Matches[1])" -ForegroundColor Green
        }
    }
} else {
    Write-Host "    Nenhum script encontrado" -ForegroundColor Red
}

# Verificar logs recentes
Write-Host ""
Write-Host "[4] Últimos Logs:" -ForegroundColor Yellow
$logPaths = @("C:\\\\CyberShield\\\\logs\\\\agent.log", "C:\\\\CyberShield\\\\agent.log")
$foundLog = $false
foreach ($logPath in $logPaths) {
    if (Test-Path $logPath) {
        Get-Content $logPath -Tail 10 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        $foundLog = $true
        break
    }
}
if (-not $foundLog) {
    Write-Host "    Arquivo de log não encontrado" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Diagnóstico Concluído ===" -ForegroundColor Cyan
`;
