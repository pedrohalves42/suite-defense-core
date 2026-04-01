/**
 * Hotfix: Multi-browser, key ready gate, unified poll, force update task retarget, USB whitelist
 */
import type { HotfixContext } from './types.ts';

/** HOTFIX 37: Multi-browser collection */
export function hotfixMultiBrowser(ctx: HotfixContext): void {
  if (ctx.content.includes('Invoke-CollectWebActivity') && !ctx.content.includes('HOTFIX-MULTI-BROWSER')) {
    const summaryLogPattern = /(\s*Write-Log "\[WEB-ACTIVITY-V5(?:\.14)?\] Collected:)/;
    
    if (summaryLogPattern.test(ctx.content)) {
      const injectedBlock = [
        '',
        '        # HOTFIX-MULTI-BROWSER: Collect Brave, Opera, OperaGX, Vivaldi + multi-profile Chrome/Edge',
        '        try {',
        '        $extraChromiumBrowsers = @(',
        '            @{ Name = "Brave";   Path = "AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data" },',
        '            @{ Name = "Opera";   Path = "AppData\\Roaming\\Opera Software\\Opera Stable" },',
        '            @{ Name = "OperaGX"; Path = "AppData\\Roaming\\Opera Software\\Opera GX Stable" },',
        '            @{ Name = "Vivaldi"; Path = "AppData\\Local\\Vivaldi\\User Data" }',
        '        )',
        '        foreach ($xBrowser in $extraChromiumBrowsers) {',
        '            try {',
        '                $xUserData = Join-Path $userPath $xBrowser.Path',
        '                if (-not (Test-Path $xUserData)) { continue }',
        '                $xProfDirs = @()',
        '                $xDefault = Join-Path $xUserData "Default"',
        '                if (Test-Path $xDefault) { $xProfDirs += $xDefault }',
        '                try { $xExtra = Get-ChildItem $xUserData -Directory -Filter "Profile *" -EA SilentlyContinue; if ($xExtra) { $xProfDirs += $xExtra.FullName } } catch {}',
        '                if ($xBrowser.Name -in @("Opera","OperaGX") -and (Test-Path (Join-Path $xUserData "History"))) { $xProfDirs += $xUserData }',
        '                foreach ($xProf in $xProfDirs) {',
        '                    $xHist = Join-Path $xProf "History"',
        '                    if (-not (Test-Path $xHist)) { continue }',
        '                    $xProfName = Split-Path $xProf -Leaf',
        '                    $xSrc = "$($xBrowser.Name.ToLower())_${userName}_${xProfName}"',
        '                    $xTmp = "$env:TEMP\\$($xBrowser.Name.ToLower())_hist_$(Get-Random).db"',
        '                    try {',
        '                        Copy-Item $xHist $xTmp -Force -EA SilentlyContinue',
        '                        if (Test-Path $xTmp) {',
        '                            $xSql = $null',
        '                            try { $xSql = Get-BrowserHistorySQLite -DbPath $xTmp -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" -BrowserName $xBrowser.Name -UserName $userName } catch {}',
        '                            if ($xSql -and $xSql.Count -gt 0) {',
        '                                foreach ($xRow in $xSql) {',
        '                                    $xDom = Extract-DomainFromUrl $xRow.url',
        '                                    if (-not $xDom -or $xDom -like "localhost*" -or $xDom -like "*.local") { continue }',
        '                                    $xVAt = ConvertFrom-WebKitTimestamp $xRow.last_visit_time',
        '                                    [void]$browserHistory.Add(@{ domain = $xDom; url = $xRow.url; source = $xSrc; browser = $xBrowser.Name.ToLower(); visited_at = if ($xVAt) { $xVAt.ToString("o") } else { $nowUtc.ToString("o") }; visit_count = [int]$xRow.visit_count })',
        '                                }',
        '                            }',
        '                        }',
        '                    } catch {} finally { Remove-Item $xTmp -Force -EA SilentlyContinue }',
        '                }',
        '            } catch {}',
        '        }',
        '        # HOTFIX-MULTI-PROFILE: Scan additional Chrome/Edge profiles',
        '        foreach ($xChrome in @(@{Name="Chrome";Base="AppData\\Local\\Google\\Chrome\\User Data"},@{Name="Edge";Base="AppData\\Local\\Microsoft\\Edge\\User Data"})) {',
        '            try {',
        '                $xUd = Join-Path $userPath $xChrome.Base',
        '                if (-not (Test-Path $xUd)) { continue }',
        '                $xProfiles = Get-ChildItem $xUd -Directory -Filter "Profile *" -EA SilentlyContinue',
        '                foreach ($xPr in $xProfiles) {',
        '                    $xPrHist = Join-Path $xPr.FullName "History"',
        '                    if (-not (Test-Path $xPrHist)) { continue }',
        '                    $xPrSrc = "$($xChrome.Name.ToLower())_${userName}_$($xPr.Name)"',
        '                    $xPrTmp = "$env:TEMP\\$($xChrome.Name.ToLower())_prof_$(Get-Random).db"',
        '                    try {',
        '                        Copy-Item $xPrHist $xPrTmp -Force -EA SilentlyContinue',
        '                        if (Test-Path $xPrTmp) {',
        '                            $xPrSql = $null',
        '                            try { $xPrSql = Get-BrowserHistorySQLite -DbPath $xPrTmp -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" -BrowserName $xChrome.Name -UserName $userName } catch {}',
        '                            if ($xPrSql -and $xPrSql.Count -gt 0) {',
        '                                foreach ($xPrRow in $xPrSql) {',
        '                                    $xPrDom = Extract-DomainFromUrl $xPrRow.url',
        '                                    if (-not $xPrDom -or $xPrDom -like "localhost*" -or $xPrDom -like "*.local") { continue }',
        '                                    $xPrVAt = ConvertFrom-WebKitTimestamp $xPrRow.last_visit_time',
        '                                    [void]$browserHistory.Add(@{ domain = $xPrDom; url = $xPrRow.url; source = $xPrSrc; browser = $xChrome.Name.ToLower(); visited_at = if ($xPrVAt) { $xPrVAt.ToString("o") } else { $nowUtc.ToString("o") }; visit_count = [int]$xPrRow.visit_count })',
        '                                }',
        '                            }',
        '                        }',
        '                    } catch {} finally { Remove-Item $xPrTmp -Force -EA SilentlyContinue }',
        '                }',
        '            } catch {}',
        '        }',
        '        } catch { Write-Log "[WEB-ACTIVITY] Extra browser scan error (non-fatal): $($_.Exception.Message)" "WARN" }',
        '',
      ].join('\n');

      ctx.content = ctx.content.replace(summaryLogPattern, (_match, capturedWriteLog) => {
        return injectedBlock + capturedWriteLog;
      });
      ctx.reasons.push('multi_browser_brave_opera_vivaldi');
    }
  }
}

/** HOTFIX 38: Key readiness gate */
export function hotfixKeyReadyGate(ctx: HotfixContext): void {
  if (ctx.content.includes('Initialize-AgentKeys') && !ctx.content.includes('HOTFIX-KEY-READY-GATE')) {
    const keyReadyGate = `
    # HOTFIX-KEY-READY-GATE: BUG 2 fix - ensure signing key is ready before first job submission
    if (-not $Global:AgentPrivateKey -and -not $Global:AgentRsaKey) {
        Write-Log "[BOOT] No signing key available after Initialize-AgentKeys. Attempting RSA-2048 emergency generation..." "WARN"
        try {
            $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
            $rsaPrivB64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
            $rsaPubB64 = [Convert]::ToBase64String($rsa.ExportCspBlob($false))
            $Global:AgentPrivateKey = $rsaPrivB64
            $Global:AgentPublicKey = $rsaPubB64
            $Global:AgentRsaKey = $rsa
            $Global:AgentSigningAlgorithm = "RSA-2048-CSP"
            $fpBytes = $rsa.ExportCspBlob($false)
            $sha = [System.Security.Cryptography.SHA256]::Create()
            $fpHash = $sha.ComputeHash($fpBytes)
            $Global:KeyFingerprint = [BitConverter]::ToString($fpHash).Replace("-","").ToLower()
            $sha.Dispose()
            $keyDir = "C:\\\\CyberShield\\\\keys"
            if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }
            @{ algorithm = "RSA-2048-CSP"; private_key = $rsaPrivB64; public_key = $rsaPubB64; fingerprint = $Global:KeyFingerprint; created_at = (Get-Date).ToString("o") } | ConvertTo-Json -Depth 3 | Out-File "$keyDir\\\\agent_keys.json" -Encoding UTF8 -Force
            Write-Log "[BOOT] RSA-2048-CSP emergency key generated and persisted. Signing ready." "SUCCESS"
        } catch {
            Write-Log "[BOOT] Emergency key generation failed: $($_.Exception.Message). Jobs will be unsigned." "ERROR"
        }
    }
`;
    const updated = ctx.content.replace(
      /(Initialize-AgentKeys[^\r\n]*(?:\r?\n\s*\})?)/,
      '$1' + keyReadyGate
    );
    if (updated !== ctx.content) {
      ctx.content = updated;
      ctx.reasons.push('key_ready_gate');
    }
  }
}

/** HOTFIX 39: Normalize poll interval to 600s */
export function hotfixUnifiedPoll(ctx: HotfixContext): void {
  if (ctx.content.includes('$Global:JobPollIntervalSeconds') && !ctx.content.includes('HOTFIX-UNIFIED-POLL')) {
    ctx.content = ctx.content.replace(
      /\$Global:JobPollIntervalSeconds\s*=\s*300/g,
      '$Global:JobPollIntervalSeconds = 600 <# HOTFIX-UNIFIED-POLL #>'
    );
    ctx.content = ctx.content.replace(
      /if\s*\(\$newJobInterval\s*-lt\s*\d+\)\s*\{\s*\$newJobInterval\s*=\s*\d+\s*\}/g,
      'if ($newJobInterval -lt 600) { $newJobInterval = 600 } <# HOTFIX-UNIFIED-POLL #>'
    );
    if (ctx.content.includes('HOTFIX-UNIFIED-POLL')) {
      ctx.reasons.push('unified_poll_interval');
    }
  }
}

/** HOTFIX 40: force_update must retarget the Scheduled Task */
export function hotfixForceUpdateTaskRetarget(ctx: HotfixContext): void {
  if (ctx.content.includes("[FORCE UPDATE] Detectando Scheduled Task...") && !ctx.content.includes('HOTFIX-TASK-RETARGET')) {
    const taskRetargetBlock = `        # DYNAMIC TASK DETECTION: Find the correct Scheduled Task name
        Write-Log "[FORCE UPDATE] Detectando Scheduled Task..." "INFO"
        $taskName = $null
        $taskPath = "\\\\"
        $taskPatterns = @(
            "CyberShieldAgent-$($Global:AgentName)",
            "CyberShieldAgent",
            "CyberShield Agent",
            "CyberShield*"
        )
        
        foreach ($pattern in $taskPatterns) {
            $foundTask = Get-ScheduledTask -TaskName $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($foundTask) {
                $taskName = $foundTask.TaskName
                $taskPath = if ($foundTask.TaskPath) { $foundTask.TaskPath } else { "\\\\" }
                Write-Log "[FORCE UPDATE] Task encontrada: $taskName" "INFO"
                break
            }
        }
        
        if ($taskName) {
            try {
                $taskExecute = "powershell.exe"
                try {
                    $taskDef = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
                    if ($taskDef -and $taskDef.Actions -and $taskDef.Actions.Count -gt 0 -and $taskDef.Actions[0].Execute) {
                        $taskExecute = $taskDef.Actions[0].Execute
                    }
                } catch { }

                $taskArgStr = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $targetScript + '" -ServerUrl "' + $Global:ServerUrl + '" -AgentToken "' + $Global:AgentToken + '" -HmacSecret "' + $Global:HmacSecret + '" -AgentName "' + $Global:AgentName + '"'
                $taskAction = New-ScheduledTaskAction -Execute $taskExecute -Argument $taskArgStr
                Set-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Action $taskAction -ErrorAction Stop | Out-Null
                Write-Log "[FORCE UPDATE] Task '$taskName' atualizada para apontar para $targetScript" "SUCCESS" <# HOTFIX-TASK-RETARGET #>
            } catch {
                Write-Log "[FORCE UPDATE] Falha ao atualizar action da task '$taskName': $($_.Exception.Message)" "WARN"
            }

            try {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Write-Log "[FORCE UPDATE] Task '$taskName' reiniciada - nova versao ativa!" "SUCCESS"
            } catch {
                Write-Log "[FORCE UPDATE] Restart task falhou, sera ativado no proximo boot: $($_.Exception.Message)" "WARN"
            }
        } else {
            Write-Log "[FORCE UPDATE] Nenhuma Scheduled Task encontrada - nova versao ativa no proximo boot" "WARN"
        }`;

    const updated = ctx.content.replace(
      /# DYNAMIC TASK DETECTION: Find the correct Scheduled Task name[\s\S]*?(?=\r?\n\s*# EXIT para permitir novo script iniciar)/m,
      taskRetargetBlock
    );

    if (updated !== ctx.content) {
      ctx.content = updated;
      ctx.reasons.push('force_update_task_retarget');
    }
  }
}

/** HOTFIX 41: USB whitelisted devices should NOT count as threats */
export function hotfixUsbWhitelistNoise(ctx: HotfixContext): void {
  if (
    ctx.content.includes('Test-UsbDevices') &&
    !ctx.content.includes('HOTFIX-USB-WHITELIST-NOISE')
  ) {
    if (ctx.content.includes('$whitelistChanged = $false') && !ctx.content.includes('$usbUnauthorizedCount')) {
      ctx.content = ctx.content.replace(
        /\$whitelistChanged = \$false/,
        '$whitelistChanged = $false\n            $usbUnauthorizedCount = 0 # HOTFIX-USB-WHITELIST-NOISE'
      );
    }
    
    if (ctx.content.includes('Show-SecurityToast') && ctx.content.includes('USB conectado:')) {
      ctx.content = ctx.content.replace(
        /(\s+)Show-SecurityToast\s*`\s*\n\s*-Title "CyberShield - Dispositivo USB Detectado"/,
        '$1$usbUnauthorizedCount++ # HOTFIX-USB-WHITELIST-NOISE\n$1Show-SecurityToast `\n                    -Title "CyberShield - Dispositivo USB Detectado"'
      );
    }
    
    ctx.content = ctx.content.replace(
      /return @\{ status = "detected"; count = @\(\$usbDrives\)\.Count; devices = @\(\$usbDrives\)/g,
      'return @{ status = "detected"; count = @($usbDrives).Count; unauthorized_count = $usbUnauthorizedCount; devices = @($usbDrives)'
    );
    
    ctx.content = ctx.content.replace(
      /if \(\$results\.usb -is \[hashtable\] -and \$results\.usb\.status -eq "detected"\)\s*(?:<#[^#]*#>\s*)?\{\s*\$results\.threats_found \+= \$results\.usb\.count\s*\}/g,
      `if ($results.usb -is [hashtable] -and $results.usb.status -eq "detected" -and $results.usb.unauthorized_count -gt 0) { $results.threats_found += $results.usb.unauthorized_count } <# HOTFIX-USB-WHITELIST-NOISE #>`
    );
    
    ctx.reasons.push('usb_whitelist_noise_reduction');
  }
}
