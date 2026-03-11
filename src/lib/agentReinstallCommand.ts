interface BuildAgentReinstallCommandParams {
  serverUrl: string;
  fallbackServerUrl?: string;
  agentToken: string;
  hmacSecret: string;
  agentName: string;
}

const escapeForSingleQuotedPowerShell = (value: string) => value.replace(/'/g, "''");

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
    "Get-ScheduledTask -TaskName 'CyberShield*' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue };",
    "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -match 'cybershield-agent' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };",
    "$ErrorActionPreference = 'Stop';",
    '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;',
    "$dir='C:\\CyberShield'; if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };",
    '$dataDir = "$dir\\data"; if (!(Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null };',
    'Get-ChildItem "$dir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue;',
    '$hashJson = "$dataDir\\expected_script_hash.json"; $hashTxt = "$dataDir\\expected_script_hash.txt";',
    'if (Test-Path $hashJson) { Remove-Item $hashJson -Force -ErrorAction SilentlyContinue };',
    'if (Test-Path $hashTxt) { Remove-Item $hashTxt -Force -ErrorAction SilentlyContinue };',
    `$serverUrl='${serverUrlEscaped}';`,
    `$fallbackServerUrl='${fallbackServerUrlEscaped}';`,
    `$agentToken='${tokenEscaped}';`,
    `$hmacSecret='${hmacEscaped}';`,
    `$agentName='${nameEscaped}';`,
    "$baseUrls = @($serverUrl, $fallbackServerUrl) | Where-Object { $_ -and $_.Trim() -ne '' } | Select-Object -Unique;",
    '$scriptContent = $null; $resolvedBaseUrl = $null; $lastErr = $null;',
    '$isValidScript = {',
    '  param([string]$content)',
    '  if (-not $content -or $content.Length -lt 5000) { return $false }',
    "  if ($content -match '(?i)<html|<!doctype html|<body') { return $false }",
    "  if ($content -notmatch '\\[CmdletBinding\\(\\)\\]') { return $false }",
    "  if ($content -notmatch 'param\\(') { return $false }",
    "  if ($content -notmatch '\\$AgentVersion') { return $false }",
    "  if ($content -notmatch 'Invoke-SecureRequest') { return $false }",
    '  return $true',
    '};',
    'foreach ($baseUrl in $baseUrls) {',
    '  try {',
    '    $url = "$baseUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$(Get-Random)";',
    '    try {',
    '      $plain = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 60 -ErrorAction Stop;',
    '      if (& $isValidScript $plain) { $scriptContent = $plain; $resolvedBaseUrl = $baseUrl; break }',
    "      else { Write-Host ('Conteudo invalido em ' + $baseUrl + ' (Invoke-RestMethod)') -ForegroundColor Yellow }",
    '    } catch {',
    '      $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop;',
    '      if (& $isValidScript $resp.Content) { $scriptContent = $resp.Content; $resolvedBaseUrl = $baseUrl; break }',
    "      else { Write-Host ('Conteudo invalido em ' + $baseUrl + ' (Invoke-WebRequest)') -ForegroundColor Yellow }",
    '    }',
    '  } catch {',
    '    $lastErr = $_.Exception.Message;',
    "    Write-Host ('Falha ao baixar script em ' + $baseUrl + ': ' + $lastErr) -ForegroundColor Yellow;",
    '  }',
    '}',
    '  $effectiveServerUrl = if ($resolvedBaseUrl) { $resolvedBaseUrl } else { $serverUrl };',
    '  $effectiveServerUrl = if ($resolvedBaseUrl) { $resolvedBaseUrl } else { $serverUrl };',
    '  $scriptPath = "$dir\\cybershield-agent-$agentName.ps1";',
    '  [System.IO.File]::WriteAllText($scriptPath, $scriptContent, [System.Text.UTF8Encoding]::new($true));',
    '  $cfg = @{ ServerUrl=$effectiveServerUrl; AgentToken=$agentToken; HMACSecret=$hmacSecret; AgentName=$agentName };',
    '  $cfg | ConvertTo-Json | Set-Content -Path "$dir\\config.json" -Encoding UTF8 -Force;',
    "  $taskArgStr = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"' + $scriptPath + '\" -ServerUrl \"' + $effectiveServerUrl + '\" -AgentToken \"' + $agentToken + '\" -HmacSecret \"' + $hmacSecret + '\" -AgentName \"' + $agentName + '\"';",
    "  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgStr;",
    '  $trigger1 = New-ScheduledTaskTrigger -AtStartup;',
    '  $trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365);',
    '  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1);',
    "  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;",
    "  Register-ScheduledTask -TaskName 'CyberShieldAgent' -Action $action -Trigger @($trigger1,$trigger2) -Settings $settings -Principal $principal -Force;",
    "  Start-ScheduledTask -TaskName 'CyberShieldAgent';",
    '  Start-Sleep -Seconds 2;',
    "  $taskInfo = Get-ScheduledTaskInfo -TaskName 'CyberShieldAgent' -ErrorAction SilentlyContinue;",
    "  Write-Host ('CyberShield reinstalado com sucesso! Endpoint: ' + $effectiveServerUrl) -ForegroundColor Green;",
    "  if ($taskInfo) { Write-Host ('TaskResult=' + $taskInfo.LastTaskResult + ' | LastRun=' + $taskInfo.LastRunTime) -ForegroundColor Cyan }",
    "} else { Write-Host ('Erro: servidor nao retornou script PowerShell valido. Ultimo erro: ' + $lastErr) -ForegroundColor Red }",
  ];

  return parts.join(' ');
}
