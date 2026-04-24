interface BuildAgentReinstallCommandParams {
  serverUrl: string;
  fallbackServerUrl?: string;
  agentToken: string;
  hmacSecret: string;
  agentName: string;
}

const escapeForSingleQuotedPowerShell = (value: string) => value.replace(/'/g, "''");

/**
 * Builds the PowerShell one-liner used to reinstall a CyberShield agent.
 *
 * v6.1 hardening (root cause fixes):
 *  - Removed Invoke-RestMethod path: caused intermittent failures behind proxies that
 *    return text/plain as byte[] or BasicHtmlWebResponseObject (validator received
 *    "System.Byte[]" and rejected the body).
 *  - Added explicit User-Agent + Accept headers to bypass Cloudflare bot challenges
 *    that intercept default PowerShell agents and return HTML.
 *  - Added Cache-Control: no-cache + Pragma: no-cache headers (querystring cache busting
 *    alone is not honored by all CDNs).
 *  - Validator now returns a structured reason; failures log size + first 200 chars +
 *    HTTP status so operators can diagnose the actual cause.
 *  - Fallback URL is only used when it can plausibly route /functions/v1/.
 *  - TLS 1.3 enabled when available, with TLS 1.2 fallback.
 *  - Post-install: poll Get-ScheduledTaskInfo for up to 30s instead of fixed 2s sleep.
 */
export function buildAgentReinstallCommand({
  serverUrl,
  fallbackServerUrl,
  agentToken,
  hmacSecret,
  agentName,
}: BuildAgentReinstallCommandParams): string {
  const serverUrlEscaped = escapeForSingleQuotedPowerShell(serverUrl);
  const fallbackServerUrlEscaped = escapeForSingleQuotedPowerShell(fallbackServerUrl ?? '');
  const tokenEscaped = escapeForSingleQuotedPowerShell(agentToken);
  const hmacEscaped = escapeForSingleQuotedPowerShell(hmacSecret);
  const nameEscaped = escapeForSingleQuotedPowerShell(agentName);

  const parts = [
    // === Cleanup of previous installation ===
    "Get-ScheduledTask -TaskName 'CyberShield*' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue };",
    "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'cybershield-agent' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };",
    "$ErrorActionPreference = 'Stop';",
    // TLS 1.3 + 1.2 (fallback to 1.2 only on older .NET)
    "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Tls12,Tls13' } catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 };",
    '$dir="$env:ProgramData\\CyberShield"; if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };',
    '$dataDir = "$dir\\data"; if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null };',
    'Get-ChildItem "$dir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue;',
    '$hashJson = "$dataDir\\expected_script_hash.json"; $hashTxt = "$dataDir\\expected_script_hash.txt";',
    'if (Test-Path $hashJson) { Remove-Item $hashJson -Force -ErrorAction SilentlyContinue };',
    'if (Test-Path $hashTxt) { Remove-Item $hashTxt -Force -ErrorAction SilentlyContinue };',
    // Secrets directory with restricted ACL
    '$secretsDir = "$dir\\secrets";',
    'if (!(Test-Path $secretsDir)) { New-Item -ItemType Directory -Path $secretsDir -Force | Out-Null };',
    "try { $acl = New-Object System.Security.AccessControl.DirectorySecurity; $acl.SetAccessRuleProtection($true, $false); $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))); $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))); Set-Acl -Path $secretsDir -AclObject $acl } catch { Write-Host 'ACL set failed (non-critical)' -ForegroundColor Yellow };",
    // Credentials
    `$serverUrl='${serverUrlEscaped}';`,
    `$fallbackServerUrl='${fallbackServerUrlEscaped}';`,
    `$agentToken='${tokenEscaped}';`,
    `$hmacSecret='${hmacEscaped}';`,
    `$agentName='${nameEscaped}';`,
    '[System.IO.File]::WriteAllText("$secretsDir\\agent_token", $agentToken);',
    '[System.IO.File]::WriteAllText("$secretsDir\\hmac_secret", $hmacSecret);',
    "Write-Host 'Tokens stored in secure file storage' -ForegroundColor Green;",

    // === Build candidate URL list (only include fallback if it looks like a Supabase/functions host) ===
    "$baseUrls = @(); if ($serverUrl -and $serverUrl.Trim() -ne '') { $baseUrls += $serverUrl.Trim() }; if ($fallbackServerUrl -and $fallbackServerUrl.Trim() -ne '' -and $fallbackServerUrl -ne $serverUrl -and $fallbackServerUrl -match 'supabase\\.co|/functions/v1') { $baseUrls += $fallbackServerUrl.Trim() }; $baseUrls = $baseUrls | Select-Object -Unique;",

    // === Validator returns reason for diagnostics ===
    '$validateScript = {',
    '  param([string]$content)',
    "  if (-not $content) { return [pscustomobject]@{ Ok = $false; Reason = 'empty body' } }",
    "  if ($content.Length -lt 5000) { return [pscustomobject]@{ Ok = $false; Reason = ('too small: ' + $content.Length + ' bytes') } }",
    "  if ($content -match '(?i)<html|<!doctype html|<body|cf-browser-verification|challenge-platform') { return [pscustomobject]@{ Ok = $false; Reason = 'HTML/Cloudflare challenge detected' } }",
    "  if ($content -notmatch 'param\\(') { return [pscustomobject]@{ Ok = $false; Reason = 'missing param() block' } }",
    "  if ($content -notmatch 'function\\s+Initialize-Config') { return [pscustomobject]@{ Ok = $false; Reason = 'missing Initialize-Config' } }",
    "  if ($content -notmatch 'function\\s+Main') { return [pscustomobject]@{ Ok = $false; Reason = 'missing Main' } }",
    "  if ($content -notmatch 'Start-HeartbeatLoop') { return [pscustomobject]@{ Ok = $false; Reason = 'missing Start-HeartbeatLoop' } }",
    "  if ($content -notmatch 'Invoke-SecureRequest') { return [pscustomobject]@{ Ok = $false; Reason = 'missing Invoke-SecureRequest' } }",
    "  return [pscustomobject]@{ Ok = $true; Reason = 'ok' }",
    '};',

    // === Download via Invoke-WebRequest only (binary-safe + explicit headers) ===
    '$scriptContent = $null; $resolvedBaseUrl = $null; $lastErr = $null;',
    "$reqHeaders = @{ 'User-Agent' = 'CyberShield-Reinstaller/6.1'; 'Accept' = 'text/plain, text/x-powershell, */*'; 'Cache-Control' = 'no-cache'; 'Pragma' = 'no-cache' };",
    'foreach ($baseUrl in $baseUrls) {',
    '  $url = "$baseUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$([guid]::NewGuid().ToString(\'N\'))";',
    "  Write-Host ('Baixando script de: ' + $url) -ForegroundColor Cyan;",
    '  try {',
    '    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -Headers $reqHeaders -ErrorAction Stop;',
    '    $raw = $resp.Content;',
    '    if ($raw -is [byte[]]) { $plain = [System.Text.Encoding]::UTF8.GetString($raw) } else { $plain = [string]$raw };',
    "    if ($plain.Length -gt 0 -and $plain[0] -eq [char]0xFEFF) { $plain = $plain.Substring(1) };",
    '    $check = & $validateScript $plain;',
    '    if ($check.Ok) {',
    "      Write-Host ('OK - script valido (' + $plain.Length + ' bytes, status ' + $resp.StatusCode + ')') -ForegroundColor Green;",
    '      $scriptContent = $plain; $resolvedBaseUrl = $baseUrl; break',
    '    } else {',
    "      $preview = if ($plain.Length -gt 200) { $plain.Substring(0,200) } else { $plain };",
    "      Write-Host ('Conteudo invalido em ' + $baseUrl + ' [HTTP ' + $resp.StatusCode + ', ' + $plain.Length + ' bytes] - motivo: ' + $check.Reason) -ForegroundColor Yellow;",
    "      Write-Host ('Preview: ' + ($preview -replace '\\r?\\n', ' ')) -ForegroundColor DarkGray;",
    '    }',
    '  } catch {',
    "    $lastErr = $_.Exception.Message;",
    "    $statusCode = if ($_.Exception.Response) { try { [int]$_.Exception.Response.StatusCode } catch { 0 } } else { 0 };",
    "    Write-Host ('Falha HTTP em ' + $baseUrl + ' [status ' + $statusCode + ']: ' + $lastErr) -ForegroundColor Yellow;",
    '  }',
    '}',

    // === Install + register scheduled task ===
    'if ($scriptContent) {',
    '  $effectiveServerUrl = if ($resolvedBaseUrl) { $resolvedBaseUrl } else { $serverUrl };',
    '  $scriptPath = "$dir\\cybershield-agent-$agentName.ps1";',
    '  [System.IO.File]::WriteAllText($scriptPath, $scriptContent, [System.Text.UTF8Encoding]::new($true));',
    '  $cfg = @{ ApiEndpoint=$effectiveServerUrl; ServerUrl=$effectiveServerUrl; AgentToken=$agentToken; HmacSecret=$hmacSecret; AgentName=$agentName };',
    '  $cfg | ConvertTo-Json | Set-Content -Path "$dir\\config.json" -Encoding UTF8 -Force;',
    "  [Environment]::SetEnvironmentVariable('CYBERSHIELD_AGENT_NAME', $agentName, 'Machine');",
    '  $env:CYBERSHIELD_AGENT_NAME = $agentName;',
    "  [Environment]::SetEnvironmentVariable('CYBERSHIELD_API_ENDPOINT', $effectiveServerUrl, 'Machine');",
    '  $env:CYBERSHIELD_API_ENDPOINT = $effectiveServerUrl;',
    "  $taskArgStr = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $scriptPath + '\" -ApiEndpoint \"' + $effectiveServerUrl + '\"';",
    "  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgStr;",
    '  $trigger1 = New-ScheduledTaskTrigger -AtStartup;',
    '  $trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365);',
    '  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 9999) -MultipleInstances IgnoreNew;',
    "  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;",
    "  Register-ScheduledTask -TaskName 'CyberShieldAgent' -Action $action -Trigger @($trigger1,$trigger2) -Settings $settings -Principal $principal -Force | Out-Null;",
    "  Start-ScheduledTask -TaskName 'CyberShieldAgent';",
    // Poll for task result up to 30s instead of fixed Start-Sleep
    '  $taskInfo = $null;',
    '  for ($i = 0; $i -lt 15; $i++) {',
    '    Start-Sleep -Seconds 2;',
    "    $taskInfo = Get-ScheduledTaskInfo -TaskName 'CyberShieldAgent' -ErrorAction SilentlyContinue;",
    '    if ($taskInfo -and $taskInfo.LastRunTime -and $taskInfo.LastRunTime.Year -gt 1999) { break }',
    '  }',
    "  Write-Host ('CyberShield reinstalado com sucesso! Endpoint: ' + $effectiveServerUrl) -ForegroundColor Green;",
    "  if ($taskInfo) { Write-Host ('TaskResult=' + $taskInfo.LastTaskResult + ' | LastRun=' + $taskInfo.LastRunTime) -ForegroundColor Cyan } else { Write-Host 'Task registrada mas ainda sem execucao - verifique em 1-2 minutos.' -ForegroundColor Yellow }",
    "} else { Write-Host ('ERRO: nenhum host retornou script PowerShell valido. Ultimo erro: ' + $lastErr) -ForegroundColor Red; Write-Host 'Verifique: (1) conectividade com supabase.co, (2) se ha proxy/Cloudflare bloqueando User-Agent, (3) firewall corporativo.' -ForegroundColor Red; exit 1 }",
  ];

  return parts.join(' ');
}
