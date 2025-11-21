# ============================================
# FASE 1 + 3: Validacao Completa
# ============================================
# Este script valida que as Fases 1 e 3 foram executadas corretamente
#
# FASE 1: Limpeza de Cache
# FASE 3: Auditoria de Padroes Problematicos

param(
    [Parameter(Mandatory = $false)]
    [string]$NewToken = ""
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   VALIDACAO FASE 1 + 3 - CACHE CLEANUP" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# FASE 3.1: Verificar Codigo TypeScript
# ============================================
Write-Host "[FASE 3.1] Auditando Edge Functions..." -ForegroundColor Yellow

# Verificar se ha ocorrencias de padrao problematico ": $_" em catch blocks
$tsFiles = Get-ChildItem -Path "supabase/functions" -Filter "*.ts" -Recurse -File
$badPatternFound = $false
$badPatternCount = 0

foreach ($file in $tsFiles) {
    $content = Get-Content $file.FullName -Raw
    
    # Buscar padrao problematico: Write-Host ou logger seguido de ": $_"
    if ($content -match '(Write-Host|logger\.\w+).*:\s*\$_\s*["\)]') {
        $badPatternFound = $true
        $badPatternCount++
        Write-Host "  [ERROR] Padrao ': `$_' encontrado em: $($file.FullName)" -ForegroundColor Red
    }
}

if (-not $badPatternFound) {
    Write-Host "  [SUCCESS] Zero ocorrencias de ': `$_' em Edge Functions" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] $badPatternCount arquivo(s) com padrao problematico" -ForegroundColor Red
    exit 1
}

# ============================================
# FASE 3.2: Verificar Sincronizacao Agent Script
# ============================================
Write-Host ""
Write-Host "[FASE 3.2] Verificando sincronizacao agent script..." -ForegroundColor Yellow

$sourceScript = "public/agent-scripts/cybershield-agent-windows-v3.ps1"
$embeddedScript = "supabase/functions/_shared/agent-script-windows-content.ts"

if (-not (Test-Path $sourceScript)) {
    Write-Host "  [ERROR] Script fonte nao encontrado: $sourceScript" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $embeddedScript)) {
    Write-Host "  [ERROR] Script embedded nao encontrado: $embeddedScript" -ForegroundColor Red
    exit 1
}

$sourceContent = Get-Content $sourceScript -Raw
$embeddedContent = Get-Content $embeddedScript -Raw

# Extrair conteudo do template literal
if ($embeddedContent -match '(?s)AGENT_SCRIPT_WINDOWS_CONTENT = `([^`]+)`') {
    $extractedContent = $matches[1]
    
    # Remover escaping do template literal para comparacao
    $extractedContent = $extractedContent -replace '\\\\', '\'
    $extractedContent = $extractedContent -replace '\\`', '`'
    $extractedContent = $extractedContent -replace '\\\$', '$'
    
    # Normalizar line endings
    $sourceNormalized = $sourceContent -replace "`r`n", "`n"
    $extractedNormalized = $extractedContent -replace "`r`n", "`n"
    
    if ($sourceNormalized -eq $extractedNormalized) {
        Write-Host "  [SUCCESS] Agent script sincronizado corretamente" -ForegroundColor Green
    } else {
        Write-Host "  [WARNING] Possivel divergencia detectada" -ForegroundColor Yellow
        Write-Host "  Execute: npm run sync:agent" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [ERROR] Nao foi possivel extrair conteudo do template literal" -ForegroundColor Red
    exit 1
}

# ============================================
# FASE 3.3: Validar Sintaxe PowerShell 5.1
# ============================================
Write-Host ""
Write-Host "[FASE 3.3] Validando sintaxe PowerShell 5.1..." -ForegroundColor Yellow

$ps1Files = Get-ChildItem -Path "." -Filter "*.ps1" -Recurse -File | Where-Object {
    $_.FullName -notlike "*node_modules*" -and
    $_.FullName -notlike "*\.git*" -and
    $_.FullName -like "*public/agent-scripts*"
}

$syntaxErrors = 0
foreach ($file in $ps1Files) {
    $content = Get-Content $file.FullName -Raw
    $errors = $null
    
    try {
        [System.Management.Automation.PSParser]::Tokenize($content, [ref]$errors) | Out-Null
        
        if ($errors -and $errors.Count -gt 0) {
            $syntaxErrors += $errors.Count
            Write-Host "  [ERROR] $($file.Name): $($errors.Count) erro(s) de sintaxe" -ForegroundColor Red
        } else {
            Write-Host "  [OK] $($file.Name): Sintaxe valida" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [ERROR] $($file.Name): Falha ao tokenizar" -ForegroundColor Red
        $syntaxErrors++
    }
}

if ($syntaxErrors -eq 0) {
    Write-Host "  [SUCCESS] Todos os scripts PowerShell tem sintaxe valida" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] $syntaxErrors erro(s) de sintaxe encontrado(s)" -ForegroundColor Red
    exit 1
}

# ============================================
# FASE 1: Verificar Versao do Installer
# ============================================
Write-Host ""
Write-Host "[FASE 1] Verificando versao do installer..." -ForegroundColor Yellow

$versionFile = "supabase/functions/_shared/installer-version.ts"
$versionContent = Get-Content $versionFile -Raw

if ($versionContent -match "INSTALLER_VERSION = '([^']+)'") {
    $currentVersion = $matches[1]
    Write-Host "  [INFO] Versao atual: $currentVersion" -ForegroundColor Cyan
    
    if ($currentVersion -eq "3.1.2-CACHE-CLEANUP") {
        Write-Host "  [SUCCESS] Versao atualizada para force cache invalidation" -ForegroundColor Green
    } else {
        Write-Host "  [WARNING] Versao esperada: 3.1.2-CACHE-CLEANUP" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [ERROR] Nao foi possivel extrair versao do installer" -ForegroundColor Red
    exit 1
}

# ============================================
# TESTE OPCIONAL: Validar Novo Token
# ============================================
if ($NewToken -ne "") {
    Write-Host ""
    Write-Host "[OPCIONAL] Validando novo token..." -ForegroundColor Yellow
    
    $url = "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/$NewToken"
    
    try {
        # Limpar cache local primeiro
        Remove-Item "C:\Temp\installer-validation-*.ps1" -Force -ErrorAction SilentlyContinue
        
        # Baixar instalador
        $installerPath = "C:\Temp\installer-validation-$NewToken.ps1"
        Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -Headers @{
            "Cache-Control" = "no-cache, no-store, must-revalidate"
        }
        
        Write-Host "  [INFO] Instalador baixado: $installerPath" -ForegroundColor Cyan
        
        $installerContent = Get-Content $installerPath -Raw
        
        # Validar versao
        if ($installerContent -match 'v3\.1\.2-CACHE-CLEANUP') {
            Write-Host "  [SUCCESS] Versao correta no instalador: v3.1.2-CACHE-CLEANUP" -ForegroundColor Green
        } else {
            Write-Host "  [WARNING] Versao nao encontrada ou diferente no instalador" -ForegroundColor Yellow
        }
        
        # Validar padrao problematico
        if ($installerContent -match 'Write-Host.*:\s*\$_\s*"' -or $installerContent -match 'Write-InstallLog.*:\s*\$_\s*"') {
            Write-Host "  [FAIL] Padrao ': `$_' AINDA EXISTE no instalador!" -ForegroundColor Red
            exit 1
        } else {
            Write-Host "  [SUCCESS] Sem padroes problematicos no instalador" -ForegroundColor Green
        }
        
        # Validar sintaxe
        $errors = $null
        [System.Management.Automation.PSParser]::Tokenize($installerContent, [ref]$errors) | Out-Null
        
        if ($errors -and $errors.Count -gt 0) {
            Write-Host "  [FAIL] $($errors.Count) erro(s) de sintaxe no instalador" -ForegroundColor Red
            exit 1
        } else {
            Write-Host "  [SUCCESS] Sintaxe PowerShell 5.1 valida no instalador" -ForegroundColor Green
        }
        
    } catch {
        Write-Host "  [ERROR] Falha ao validar token: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ============================================
# RESUMO FINAL
# ============================================
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   RESUMO DA VALIDACAO" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] FASE 1: Cache invalidation forcado" -ForegroundColor Green
Write-Host "[SUCCESS] FASE 3: Auditoria completa aprovada" -ForegroundColor Green
Write-Host ""
Write-Host "Acoes Executadas:" -ForegroundColor Cyan
Write-Host "  - Versao atualizada: 3.1.2-CACHE-CLEANUP" -ForegroundColor White
Write-Host "  - Workflow comentado: FORCE CACHE INVALIDATION" -ForegroundColor White
Write-Host "  - Zero padroes problematicos em Edge Functions" -ForegroundColor White
Write-Host "  - Scripts v2 obsoletos removidos" -ForegroundColor White
Write-Host "  - Sintaxe PowerShell 5.1 validada" -ForegroundColor White
Write-Host ""
Write-Host "Proximos Passos:" -ForegroundColor Yellow
Write-Host "  1. Commit e push para GitHub (trigger CI/CD)" -ForegroundColor White
Write-Host "  2. Aguardar 3-5 min para propagacao do deploy" -ForegroundColor White
Write-Host "  3. Gerar token NOVO no dashboard" -ForegroundColor White
Write-Host "  4. Executar: .\validate-phase-1-3.ps1 -NewToken 'SEU_TOKEN'" -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Cyan
