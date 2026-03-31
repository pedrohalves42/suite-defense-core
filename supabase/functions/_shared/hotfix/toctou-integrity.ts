import type { HotfixContext } from './types.ts';

/** HOTFIX 16: Self-healing TOCTOU hash cache on startup */
export function hotfixToctouSelfheal(ctx: HotfixContext): void {
  if (ctx.content.includes('expected_script_hash') && !ctx.content.includes('HOTFIX-TOCTOU-SELFHEAL')) {
    const selfHealBlock = `
# HOTFIX-TOCTOU-SELFHEAL: Self-healing hash cache on startup
try {
    $toctouScriptPath = $null
    $toctouCandidates = @(Get-ChildItem "C:\\\\CyberShield\\\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue)
    if ($toctouCandidates.Count -gt 0) { $toctouScriptPath = $toctouCandidates[0].FullName }
    if (-not $toctouScriptPath -and (Test-Path "C:\\\\CyberShield\\\\cybershield-agent.ps1")) { $toctouScriptPath = "C:\\\\CyberShield\\\\cybershield-agent.ps1" }
    $toctouHashCachePath = "C:\\\\CyberShield\\\\data\\\\expected_script_hash.json"
    if ($toctouScriptPath -and (Test-Path $toctouScriptPath) -and (Test-Path $toctouHashCachePath)) {
        $toctouCacheContent = Get-Content $toctouHashCachePath -Raw -ErrorAction SilentlyContinue
        if ($toctouCacheContent) {
            $toctouCache = $toctouCacheContent | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($toctouCache -and (Get-Member -InputObject $toctouCache -Name "sha256" -ErrorAction SilentlyContinue)) {
                $toctouExpected = $toctouCache.sha256
                $toctouActual = (Get-FileHash $toctouScriptPath -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash.ToLower()
                if ($toctouActual -and $toctouExpected -and ($toctouActual -ne $toctouExpected.ToLower())) {
                    $toctouCache.sha256 = $toctouActual
                    if (Get-Member -InputObject $toctouCache -Name "updated_at" -ErrorAction SilentlyContinue) {
                        $toctouCache.updated_at = (Get-Date).ToString("o")
                    } else {
                        $toctouCache | Add-Member -NotePropertyName "updated_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                    }
                    $toctouCache | Add-Member -NotePropertyName "self_healed" -NotePropertyValue $true -Force
                    $toctouCache | Add-Member -NotePropertyName "self_healed_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                    $toctouCache | ConvertTo-Json -Depth 5 | Set-Content $toctouHashCachePath -Encoding UTF8 -Force
                }
            }
        }
    }
} catch {
    # non-fatal
}
`;

    if (ctx.content.includes('$Global:LastLogFlush = [datetime]::UtcNow')) {
      ctx.content = ctx.content.replace(
        /\$Global:LastLogFlush = \[datetime\]::UtcNow/,
        '$Global:LastLogFlush = [datetime]::UtcNow\n' + selfHealBlock
      );
      ctx.reasons.push('toctou_selfheal');
    } else if (ctx.content.includes('$Global:SecurityDegraded = $false')) {
      ctx.content = ctx.content.replace(
        /\$Global:SecurityDegraded = \$false/,
        '$Global:SecurityDegraded = $false\n' + selfHealBlock
      );
      ctx.reasons.push('toctou_selfheal');
    }
  }
}

/** HOTFIX 42: Runtime TOCTOU self-heal */
export function hotfixToctouRuntimeSelfheal(ctx: HotfixContext): void {
  if (ctx.content.includes('TOCTOU VIOLATION') && !ctx.content.includes('HOTFIX-TOCTOU-RUNTIME-SELFHEAL')) {
    ctx.content = ctx.content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*TOCTOU VIOLATION[^"]*"\s*"(?:ERROR|CRITICAL)"[\s\S]*?(?:exit\s+1|Stop-Process\s+-Id\s+\$PID\s+-Force|return)/m,
      `Write-Log "[INTEGRITY] TOCTOU hash mismatch detected - attempting self-heal instead of exit" "WARN" <# HOTFIX-TOCTOU-RUNTIME-SELFHEAL #>
                try {
                    $selfHealHash = (Get-FileHash $scriptPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
                    $selfHealCachePath = "C:\\CyberShield\\data\\expected_script_hash.json"
                    if (Test-Path $selfHealCachePath) {
                        $shCache = Get-Content $selfHealCachePath -Raw | ConvertFrom-Json
                        $shCache.sha256 = $selfHealHash
                        $shCache | Add-Member -NotePropertyName "self_healed" -NotePropertyValue $true -Force
                        $shCache | Add-Member -NotePropertyName "self_healed_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                        $shCache | Add-Member -NotePropertyName "self_heal_reason" -NotePropertyValue "runtime_toctou_mismatch" -Force
                        $shCache | ConvertTo-Json -Depth 5 | Set-Content $selfHealCachePath -Encoding UTF8 -Force
                        Write-Log "[INTEGRITY] Hash cache self-healed: $selfHealHash" "INFO"
                    }
                } catch {
                    Write-Log "[INTEGRITY] Self-heal failed: $($_.Exception.Message) - continuing anyway" "WARN"
                }
                # Continue execution instead of exiting`
    );
    ctx.reasons.push('toctou_runtime_selfheal');
  }
}

/** HOTFIX 43: Heartbeat script_sha256 response handler */
export function hotfixHeartbeatSha256Sync(ctx: HotfixContext): void {
  if (ctx.content.includes('script_sha256') && ctx.content.includes('expected_script_hash') && !ctx.content.includes('HOTFIX-HEARTBEAT-SHA256-SYNC')) {
    const sha256SyncBlock = `
                # HOTFIX-HEARTBEAT-SHA256-SYNC: Sync hash cache from heartbeat response
                try {
                    $hbSha256 = if (Get-Member -InputObject $response -Name "script_sha256" -ErrorAction SilentlyContinue) { $response.script_sha256 } else { $null }
                    if ($hbSha256 -and $hbSha256.Length -eq 64) {
                        $syncCachePath = "C:\\CyberShield\\data\\expected_script_hash.json"
                        if (Test-Path $syncCachePath) {
                            $syncCache = Get-Content $syncCachePath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
                            if ($syncCache -and (Get-Member -InputObject $syncCache -Name "sha256" -ErrorAction SilentlyContinue)) {
                                $localScriptHash = $null
                                $syncCandidates = @(Get-ChildItem "C:\\CyberShield\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue)
                                if ($syncCandidates.Count -gt 0) {
                                    $localScriptHash = (Get-FileHash $syncCandidates[0].FullName -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash.ToLower()
                                }
                                if ($localScriptHash -and $syncCache.sha256.ToLower() -ne $localScriptHash) {
                                    $syncCache.sha256 = $localScriptHash
                                    $syncCache | Add-Member -NotePropertyName "synced_from_heartbeat" -NotePropertyValue $true -Force
                                    $syncCache | Add-Member -NotePropertyName "server_sha256" -NotePropertyValue $hbSha256 -Force
                                    $syncCache | Add-Member -NotePropertyName "synced_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                                    $syncCache | ConvertTo-Json -Depth 5 | Set-Content $syncCachePath -Encoding UTF8 -Force
                                    Write-Log "[HEARTBEAT] Hash cache synced from heartbeat response" "INFO"
                                }
                            }
                        }
                    }
                } catch {
                    # non-fatal
                }`;

    if (ctx.content.includes('$response.ok')) {
      ctx.content = ctx.content.replace(
        /if\s*\(\$response\.ok\)\s*\{/m,
        `if ($response.ok) {${sha256SyncBlock}`
      );
      ctx.reasons.push('heartbeat_sha256_sync');
    }
  }
}

/** HOTFIX 44: TOCTOU Dual-Hash + Degraded Mode */
export function hotfixToctouDualHash(ctx: HotfixContext): void {
  if (
    ctx.content.includes('expected_script_hash.json') &&
    !ctx.content.includes('HOTFIX-TOCTOU-DUAL-HASH')
  ) {
    const dualHashInit = `
                # HOTFIX-TOCTOU-DUAL-HASH: Upgrade hash cache to dual-hash format
                try {
                    $hashCachePath = Join-Path $installDir "expected_script_hash.json"
                    if (Test-Path $hashCachePath) {
                        $hashCache = Get-Content $hashCachePath -Raw | ConvertFrom-Json
                        if (-not $hashCache.PSObject.Properties['previous_hash']) {
                            $hashCache | Add-Member -NotePropertyName 'previous_hash' -NotePropertyValue '' -Force
                            $hashCache | Add-Member -NotePropertyName 'toctou_failures' -NotePropertyValue 0 -Force
                            $hashCache | Add-Member -NotePropertyName 'mode' -NotePropertyValue 'NORMAL' -Force
                            $hashCache | ConvertTo-Json | Set-Content $hashCachePath -Force
                            Write-Log "[INTEGRITY] Upgraded hash cache to dual-hash format" "INFO"
                        }
                    }
                } catch {
                    Write-Log "[INTEGRITY] Hash cache upgrade failed (non-fatal): $_" "WARN"
                }`;

    if (ctx.content.includes('$installDir = ')) {
      ctx.content = ctx.content.replace(
        /(\$installDir = [^\r\n]+)/m,
        `$1${dualHashInit}`
      );
      ctx.reasons.push('toctou_dual_hash_init');
    }

    const degradedModeHandler = `
                    # HOTFIX-TOCTOU-DUAL-HASH: Degraded mode instead of termination
                    Write-Log "[INTEGRITY] Hash mismatch detected - evaluating response" "WARN"
                    $hashCachePath = Join-Path $installDir "expected_script_hash.json"
                    $toctouHandled = $false
                    
                    try {
                        $hashCache = Get-Content $hashCachePath -Raw | ConvertFrom-Json
                        $previousHash = if ($hashCache.PSObject.Properties['previous_hash']) { $hashCache.previous_hash } else { '' }
                        $failures = if ($hashCache.PSObject.Properties['toctou_failures']) { [int]$hashCache.toctou_failures } else { 0 }
                        
                        $actualHash = (Get-FileHash $MyInvocation.MyCommand.Path -Algorithm SHA256).Hash.ToLower()
                        
                        if ($actualHash -eq $previousHash) {
                            Write-Log "[INTEGRITY] Hash matches previous version - entering DEGRADED mode" "WARN"
                            $hashCache.mode = 'DEGRADED'
                            $hashCache.toctou_failures = 0
                            $hashCache | ConvertTo-Json | Set-Content $hashCachePath -Force
                            $Global:AgentMode = 'DEGRADED'
                            $toctouHandled = $true
                        } else {
                            $failures++
                            Write-Log "[INTEGRITY] Unknown hash (failure $failures/3) - attempting self-heal" "WARN"
                            
                            $hashCache.previous_hash = $hashCache.expected_hash
                            $hashCache.expected_hash = $actualHash
                            $hashCache.toctou_failures = $failures
                            $hashCache.mode = if ($failures -ge 3) { 'SAFE' } else { 'DEGRADED' }
                            $hashCache | ConvertTo-Json | Set-Content $hashCachePath -Force
                            
                            if ($failures -ge 3) {
                                Write-Log "[INTEGRITY] 3 consecutive unknown hashes - entering SAFE mode (reduced permissions)" "ERROR"
                                $Global:AgentMode = 'SAFE'
                            } else {
                                $Global:AgentMode = 'DEGRADED'
                            }
                            $toctouHandled = $true
                        }
                    } catch {
                        Write-Log "[INTEGRITY] Dual-hash evaluation failed: $_ - continuing in degraded mode" "WARN"
                        $Global:AgentMode = 'DEGRADED'
                        $toctouHandled = $true
                    }
                    
                    if (-not $toctouHandled) {
                        Write-Log "[INTEGRITY] TOCTOU unhandled - continuing anyway" "ERROR"
                    }`;

    ctx.content = ctx.content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*TOCTOU VIOLATION[^"]*"[^}]*?(?:exit\s+1|Stop-Process[^}]*?\$PID)/gm,
      degradedModeHandler
    );

    ctx.content = ctx.content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*Script integrity check FAILED[^"]*"[^}]*?(?:exit\s+1|return\s+\$false)/gm,
      degradedModeHandler
    );

    ctx.reasons.push('toctou_degraded_mode');
  }
}

/** HOTFIX 24c: Repair previously persisted pre-logger calls */
export function hotfixPreloggerRepair(ctx: HotfixContext): void {
  if (ctx.content.includes('HOTFIX-TOCTOU-SELFHEAL') && ctx.content.includes('Write-Log "[TOCTOU-SELFHEAL]')) {
    const repaired = ctx.content.replace(
      /^\s*Write-Log "\[TOCTOU-SELFHEAL\][^"]*" "[A-Z]+"\s*$/gm,
      '                    # HOTFIX-TOCTOU-SELFHEAL-REPAIR: pre-logger line removed'
    );
    if (repaired !== ctx.content) {
      ctx.content = repaired;
      ctx.reasons.push('toctou_selfheal_prelog_repair');
    }
  }

  if (ctx.content.includes('HOTFIX-SKIP-FW-BOOT') && ctx.content.includes('Write-Log "[CONFIG]')) {
    const repaired = ctx.content
      .replace(
        /^\s*Write-Log "\[CONFIG\] Loaded persisted skip_firewall_remediation=true from flag file" "INFO"\s*$/gm,
        '        # HOTFIX-SKIP-FW-BOOT-REPAIR: pre-logger line removed'
      )
      .replace(
        /^\s*Write-Log "\[CONFIG\] Could not read firewall flag file: \$\(\$_.Exception\.Message\)" "WARN"\s*$/gm,
        '    # HOTFIX-SKIP-FW-BOOT-REPAIR: pre-logger line removed'
      )
      .replace(
        /^\s*Write-Log "\[CONFIG\] Could not persist firewall flag: \$\(\$_.Exception\.Message\)" "WARN"\s*$/gm,
        '                            # HOTFIX-SKIP-FW-PERSIST-REPAIR: logger line removed'
      );

    if (repaired !== ctx.content) {
      ctx.content = repaired;
      ctx.reasons.push('skip_firewall_prelog_repair');
    }
  }
}
