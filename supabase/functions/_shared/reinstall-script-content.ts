// CyberShield Agent - Reinstallation Script Content
// Embedded version for Edge Function delivery
// Version: 6.2.0 - Optimized Loader + Hardened Validation
// Uses the robust logic from v6.1 in a standalone format.

export const REINSTALL_SCRIPT_CONTENT = `# CyberShield Agent - Hardened Reinstaller v6.2.0
param(
    [string]$agentToken,
    [string]$hmacSecret,
    [string]$agentName,
    [string]$serverUrl,
    [string]$fallbackServerUrl
)

function Write-Log {
    param([string]$Message, [string]$Color = 'Cyan')
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

Write-Log "Iniciando re-instalacao do CyberShield Agent v6.2.0..." "Yellow"

# 1. Elevacao e TLS
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Log "ERRO: Execute o PowerShell como Administrador!" "Red"
    exit 1
}

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Tls12,Tls13'
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

# 2. Limpeza de instalacoes anteriores
Write-Log "Limpando servicos e processos antigos..."
Get-ScheduledTask -TaskName 'CyberShield*' -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -match 'cybershield-agent'
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# 3. Preparacao de diretorios e seguranca
$dir = "$env:ProgramData\\CyberShield"
$dataDir = "$dir\\data"
$secretsDir = "$dir\\secrets"

@($dir, $dataDir, $secretsDir) | ForEach-Object {
    if (!(Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

# Limpar scripts antigos
Get-ChildItem "$dir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# Limpar cache de hash (forcar re-validacao)
@("$dataDir\\expected_script_hash.json", "$dataDir\\expected_script_hash.txt") | ForEach-Object {
    if (Test-Path $_) { Remove-Item $_ -Force -ErrorAction SilentlyContinue }
}

# Aplicar ACLs restritas aos segredos
try {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
    $adminSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($adminSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Set-Acl -Path $secretsDir -AclObject $acl
} catch {
    Write-Log "Aviso: Nao foi possivel aplicar restricoes de ACL (nao critico)." "Yellow"
}

# 4. Armazenar credenciais
[System.IO.File]::WriteAllText("$secretsDir\\agent_token", $agentToken)
[System.IO.File]::WriteAllText("$secretsDir\\hmac_secret", $hmacSecret)
Write-Log "Tokens armazenados em seguranca em $secretsDir" "Green"

# 5. Download do script principal com tratamento de borda (Cloudflare)
$baseUrls = @()
if ($serverUrl) { $baseUrls += $serverUrl.Trim() }
if ($fallbackServerUrl -and $fallbackServerUrl -ne $serverUrl -and $fallbackServerUrl -match 'supabase\\.co|/functions/v1') {
    $baseUrls += $fallbackServerUrl.Trim()
}
$baseUrls = $baseUrls | Select-Object -Unique

$validateScript = {
    param([string]$content)
    if (!$content) { return @{ Ok=$false; Reason='Empty body' } }
    if ($content.Length -lt 5000) { return @{ Ok=$false; Reason="Too small ($($content.Length) bytes)" } }
    if ($content -match '(?i)<html|<!doctype html|<body|cf-browser-verification|challenge-platform') {
        return @{ Ok=$false; Reason='HTML/Cloudflare challenge detected' }
    }
    $checks = @('param\\(', 'Initialize-Config', 'Main', 'Start-HeartbeatLoop', 'Invoke-SecureRequest')
    foreach ($c in $checks) {
        if ($content -notmatch $c) { return @{ Ok=$false; Reason="Missing $c" } }
    }
    return @{ Ok=$true }
}

$scriptContent = $null
$resolvedUrl = $null
$headers = @{
    'User-Agent' = 'CyberShield-Reinstaller/6.2'
    'Accept' = 'text/plain, text/x-powershell'
    'Cache-Control' = 'no-cache'
    'Pragma' = 'no-cache'
}

foreach ($baseUrl in $baseUrls) {
    $url = "$baseUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$([guid]::NewGuid().ToString('N'))"
    Write-Log "Baixando de: $url"
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -Headers $headers -ErrorAction Stop
        $plain = if ($resp.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($resp.Content) } else { [string]$resp.Content }
        if ($plain.Length -gt 0 -and $plain[0] -eq [char]0xFEFF) { $plain = $plain.Substring(1) }
        
        $check = & $validateScript $plain
        if ($check.Ok) {
            Write-Log "Download bem sucedido ($($plain.Length) bytes)" "Green"
            $scriptContent = $plain
            $resolvedUrl = $baseUrl
            break
        } else {
            Write-Log "Validacao falhou: $($check.Reason)" "Yellow"
        }
    } catch {
        Write-Log "Erro HTTP: $($_.Exception.Message)" "Yellow"
    }
}

if (!$scriptContent) {
    Write-Log "ERRO CRITICO: Nao foi possivel baixar um script valido. Verifique conectividade." "Red"
    exit 1
}

# 6. Escrita e registro da tarefa agendada
$scriptPath = "$dir\\cybershield-agent-$agentName.ps1"
[System.IO.File]::WriteAllText($scriptPath, $scriptContent, [System.Text.UTF8Encoding]::new($true))

$effectiveUrl = if ($resolvedUrl) { $resolvedUrl } else { $serverUrl }
$cfg = @{ ApiEndpoint=$effectiveUrl; ServerUrl=$effectiveUrl; AgentToken=$agentToken; HmacSecret=$hmacSecret; AgentName=$agentName }
$cfg | ConvertTo-Json | Set-Content -Path "$dir\\config.json" -Encoding UTF8 -Force

[Environment]::SetEnvironmentVariable('CYBERSHIELD_AGENT_NAME', $agentName, 'Machine')
[Environment]::SetEnvironmentVariable('CYBERSHIELD_API_ENDPOINT', $effectiveUrl, 'Machine')

$taskArg = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$scriptPath\`" -ApiEndpoint \`"$effectiveUrl\`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArg
$trigger1 = New-ScheduledTaskTrigger -AtStartup
$trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 9999) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName 'CyberShieldAgent' -Action $action -Trigger @($trigger1,$trigger2) -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'CyberShieldAgent'

Write-Log "Verificando inicializacao (aguarde 15s)..."
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    $info = Get-ScheduledTaskInfo -TaskName 'CyberShieldAgent' -ErrorAction SilentlyContinue
    if ($info.LastRunTime.Year -gt 2000) {
        Write-Log "Tarefa em execucao. Resultado: $($info.LastTaskResult)" "Green"
        break
    }
}

Write-Log "RE-INSTALACAO CONCLUIDA COM SUCESSO!" "Green"
`;
