<#
.SYNOPSIS
    Script de validacao para installers e agent scripts do CyberShield

.DESCRIPTION
    Valida installers e scripts do agente CyberShield verificando:
    - Encoding correto (UTF-8 sem BOM / ASCII)
    - Ausencia de caracteres nao-ASCII (emojis, simbolos Unicode)
    - Sintaxe PowerShell 5.1 valida
    - Presenca de funcoes criticas do agente
    - Presenca de parametros essenciais (StartedAt para Jobs v3)

.PARAMETER ScriptPath
    Caminho completo para o arquivo .ps1 a ser validado

.EXAMPLE
    .\verificar-installer-agente.ps1 -ScriptPath "C:\Users\Pedro\Downloads\installer.ps1"
    
.EXAMPLE
    .\verificar-installer-agente.ps1 -ScriptPath "C:\CyberShield\cybershield-agent-v3.ps1"

.NOTES
    Versao: 1.0.0
    Autor: CyberShield Team
    Ultima atualizacao: 2025-01-20
#>

param(
    [Parameter(Mandatory = $true, HelpMessage = "Caminho completo para o arquivo .ps1 a validar")]
    [ValidateScript({Test-Path $_})]
    [string]$ScriptPath
)

$ErrorActionPreference = "Continue"
$validationPassed = $true

Write-Host ""
Write-Host "=== Verificacao de Script do Agente / Installer ===" -ForegroundColor Cyan
Write-Host "Alvo: $ScriptPath" -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $ScriptPath)) {
    Write-Host "[ERROR] Arquivo nao encontrado: $ScriptPath" -ForegroundColor Red
    exit 1
}

# =========================
# 1) Ler bytes e detectar encoding
# =========================
Write-Host "=== 1) Encoding ===" -ForegroundColor Cyan

$bytes = [System.IO.File]::ReadAllBytes($ScriptPath)
$fileSize = $bytes.Length
Write-Host ("Tamanho: {0:N0} bytes ({1:N2} KB)" -f $fileSize, ($fileSize / 1024)) -ForegroundColor DarkGray

$encodingType = "utf8NoBom"

if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    Write-Host "[ERROR] Encoding detectado: UTF-16 LE (Unicode) - NAO IDEAL para agente" -ForegroundColor Red
    Write-Host "        Este encoding pode causar falhas no PowerShell 5.1" -ForegroundColor Red
    $encodingType = "utf16le"
    $validationPassed = $false
} elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
    Write-Host "[ERROR] Encoding detectado: UTF-16 BE - NAO IDEAL" -ForegroundColor Red
    $encodingType = "utf16be"
    $validationPassed = $false
} elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "[WARN] Encoding detectado: UTF-8 COM BOM (funciona, mas preferimos sem BOM)" -ForegroundColor Yellow
    $encodingType = "utf8Bom"
} else {
    Write-Host "[OK] Encoding detectado: UTF-8 sem BOM / ASCII (IDEAL)" -ForegroundColor Green
    $encodingType = "utf8NoBom"
}

switch ($encodingType) {
    "utf16le" { $textEncoding = [System.Text.Encoding]::Unicode }
    "utf16be" { $textEncoding = [System.Text.Encoding]::BigEndianUnicode }
    "utf8Bom" { $textEncoding = New-Object System.Text.UTF8Encoding($true) }
    default   { $textEncoding = New-Object System.Text.UTF8Encoding($false) }
}

# =========================
# 2) Ler conteudo com encoding correto
# =========================
try {
    $content = [System.IO.File]::ReadAllText($ScriptPath, $textEncoding)
} catch {
    Write-Host "[ERROR] Erro ao ler arquivo com encoding detectado: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Validacao de tamanho minimo (evita scripts vazios ou corrompidos)
if ($content.Length -lt 1000) {
    Write-Host "[ERROR] Script muito pequeno ($($content.Length) chars). Esperado > 1000 chars." -ForegroundColor Red
    Write-Host "        Isso pode indicar um script corrompido ou vazio." -ForegroundColor Red
    $validationPassed = $false
}

# =========================
# 3) Verificar caracteres nao-ASCII (emoji, simbolos, etc.)
# =========================
Write-Host ""
Write-Host "=== 2) Caracteres nao-ASCII (emoji / simbolos) ===" -ForegroundColor Cyan

if ($content -match '[^\x00-\x7F]') {
    Write-Host "[WARN] Foram encontrados caracteres fora do ASCII basico." -ForegroundColor Yellow
    Write-Host "       Isso pode causar problemas de parsing no PowerShell 5.1" -ForegroundColor Yellow
    Write-Host "       Exemplos (primeiros 10):" -ForegroundColor Yellow
    
    $nonAscii = ($content.ToCharArray() | Where-Object { [int][char]$_ -gt 127 } | Select-Object -Unique | Select-Object -First 10)
    foreach ($ch in $nonAscii) {
        $code = [int][char]$ch
        Write-Host ("       '{0}' (U+{1})" -f $ch, $code.ToString("X4")) -ForegroundColor DarkYellow
    }
    $validationPassed = $false
} else {
    Write-Host "[OK] Nenhum caractere fora do ASCII basico detectado." -ForegroundColor Green
}

# =========================
# 4) Validar sintaxe PowerShell 5.1
# =========================
Write-Host ""
Write-Host "=== 3) Sintaxe PowerShell 5.1 ===" -ForegroundColor Cyan

$errors = $null
try {
    $null = [System.Management.Automation.PSParser]::Tokenize($content, [ref]$errors)
} catch {
    Write-Host "[ERROR] Erro ao chamar PSParser.Tokenize: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($errors -and $errors.Count -gt 0) {
    Write-Host "[ERROR] $($errors.Count) erro(s) de sintaxe encontrado(s):" -ForegroundColor Red
    $lines = $content -split "`r?`n"
    foreach ($err in $errors) {
        $lineNum = $err.Token.StartLine
        Write-Host ("        Linha {0}, Coluna {1}: {2}" -f $lineNum, $err.Token.StartColumn, $err.Message) -ForegroundColor Red

        $start = [Math]::Max(1, $lineNum - 2)
        $end   = [Math]::Min($lines.Count, $lineNum + 2)
        for ($i = $start; $i -le $end; $i++) {
            $prefix = $(if ($i -eq $lineNum) { ">>" } else { "  " })
            Write-Host ("{0} {1,4}: {2}" -f $prefix, $i, $lines[$i-1]) -ForegroundColor DarkGray
        }
        Write-Host ""
    }
    $validationPassed = $false
} else {
    Write-Host "[OK] Sintaxe PowerShell 5.1 VALIDA" -ForegroundColor Green
}

# =========================
# 5) Verificar funcoes criticas do AGENTE
# =========================
Write-Host ""
Write-Host "=== 4) Funcoes criticas de AGENTE ===" -ForegroundColor Cyan

$requiredFunctions = @(
    'Submit-JobResult',
    'Send-Heartbeat',
    'Poll-Jobs',
    'Get-HmacSignature'
)

$hasAnyAgentFunction = $false
$missingFunctions = @()

foreach ($func in $requiredFunctions) {
    if ($content -match ("function\s+{0}\b" -f [regex]::Escape($func))) {
        Write-Host ("[OK] Funcao {0} presente" -f $func) -ForegroundColor Green
        $hasAnyAgentFunction = $true
    } else {
        Write-Host ("[WARN] Funcao {0} NAO encontrada" -f $func) -ForegroundColor Yellow
        $missingFunctions += $func
    }
}

if (-not $hasAnyAgentFunction) {
    Write-Host "[INFO] Nenhuma funcao tipica de agente detectada." -ForegroundColor DarkGray
    Write-Host "       Provavelmente este e apenas o instalador (nao o agent-script)." -ForegroundColor DarkGray
} elseif ($missingFunctions.Count -gt 0) {
    Write-Host "[WARN] Script parece ser um agent-script mas esta faltando funcoes criticas:" -ForegroundColor Yellow
    $missingFunctions | ForEach-Object { Write-Host "       - $_" -ForegroundColor Yellow }
}

# =========================
# 6) Verificar StartedAt (fix de jobs v3)
# =========================
Write-Host ""
Write-Host "=== 5) Presenca de StartedAt (Jobs v3) ===" -ForegroundColor Cyan

if ($content -match '\$StartedAt') {
    Write-Host "[OK] Parametro/variavel StartedAt encontrado no script" -ForegroundColor Green
} else {
    Write-Host "[WARN] Parametro/variavel StartedAt NAO encontrado" -ForegroundColor Yellow
    Write-Host "       Script pode estar sem o fix de jobs v3 (timestamps de execucao)" -ForegroundColor Yellow
}

# =========================
# 7) Verificar assinatura CyberShield
# =========================
Write-Host ""
Write-Host "=== 6) Assinatura CyberShield ===" -ForegroundColor Cyan

if ($content -match 'CyberShield Agent') {
    Write-Host "[OK] Assinatura 'CyberShield Agent' encontrada no script" -ForegroundColor Green
} else {
    Write-Host "[WARN] Assinatura 'CyberShield Agent' NAO encontrada" -ForegroundColor Yellow
    Write-Host "       Isso pode indicar um script modificado ou nao-oficial" -ForegroundColor Yellow
}

# =========================
# 8) Validar versao do installer (se baixado via HTTP)
# =========================
Write-Host ""
Write-Host "=== 7) Versao do Installer (se aplicavel) ===" -ForegroundColor Cyan

# Tentar extrair URL do script se estiver em comentario
$urlMatch = $content | Select-String -Pattern 'Downloaded from: (https?://[^\s]+)' -AllMatches
if ($urlMatch) {
    $installerUrl = $urlMatch.Matches[0].Groups[1].Value
    Write-Host "URL detectada: $installerUrl" -ForegroundColor DarkGray
    
    try {
        $response = Invoke-WebRequest -Uri $installerUrl -Method Head -UseBasicParsing -ErrorAction Stop
        $version = $response.Headers['X-Installer-Version']
        $updated = $response.Headers['X-Installer-Updated']
        
        if ($version) {
            Write-Host "Versao do servidor: $version" -ForegroundColor White
            Write-Host "Atualizado em: $updated" -ForegroundColor White
            
            if ($version -match '3\.1\.1-PARSERERROR-FIX') {
                Write-Host "[OK] Versao CORRETA (ParserError fix aplicado)" -ForegroundColor Green
            } else {
                Write-Host "[WARN] Versao ANTIGA detectada no servidor" -ForegroundColor Yellow
                $validationPassed = $false
            }
        } else {
            Write-Host "[INFO] Servidor nao retorna header X-Installer-Version" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "[INFO] Nao foi possivel verificar versao do servidor (OK se validando arquivo local)" -ForegroundColor DarkGray
    }
} else {
    Write-Host "[INFO] Script local - validacao de versao do servidor nao aplicavel" -ForegroundColor DarkGray
}

# =========================
# RESULTADO FINAL
# =========================
Write-Host ""
Write-Host "=== Resumo da Validacao ===" -ForegroundColor Cyan
Write-Host ""

if ($validationPassed) {
    Write-Host "[SUCCESS] Todas as validacoes criticas PASSARAM" -ForegroundColor Green
    Write-Host "          O script esta pronto para ser usado em PowerShell 5.1" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "[FAILURE] Validacao FALHOU - problemas criticos detectados" -ForegroundColor Red
    Write-Host "          NAO use este script ate corrigir os problemas acima" -ForegroundColor Red
    Write-Host ""
    exit 1
}
