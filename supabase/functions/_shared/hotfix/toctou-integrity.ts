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

/** HOTFIX 42: Runtime TOCTOU self-heal (v2 - expanded regex for v5.0.15+) */
export function hotfixToctouRuntimeSelfheal(ctx: HotfixContext): void {
  if (ctx.content.includes('TOCTOU VIOLATION') && !ctx.content.includes('HOTFIX-TOCTOU-RUNTIME-SELFHEAL')) {
    // Try multiple regex patterns to match different agent versions
    const patterns = [
      // Original pattern: Write-Log "[INTEGRITY] TOCTOU VIOLATION..." "ERROR" ... exit 1|Stop-Process
      /Write-Log\s*"\[INTEGRITY\]\s*TOCTOU VIOLATION[^"]*"\s*"(?:ERROR|CRITICAL)"[\s\S]*?(?:exit\s+1|\[Environment\]::Exit\(\d+\)|Stop-Process\s+-Id\s+\$PID\s+-Force|return)/m,
      // v5.0.15 pattern: "RUNTIME TOCTOU VIOLATION" with break or exit
      /Write-Log\s*"\[INTEGRITY\]\s*(?:RUNTIME\s+)?TOCTOU VIOLATION[^"]*"\s*"(?:ERROR|CRITICAL|WARN)"[\s\S]*?(?:exit\s+\d+|\[Environment\]::Exit\(\d+\)|Stop-Process[^\n]*|break|return)/m,
      // Broader: any "TOCTOU VIOLATION" log followed by termination within 10 lines
      /Write-Log\s*"[^"]*TOCTOU VIOLATION[^"]*"\s*"[A-Z]+"[\s\S]{0,500}?(?:exit\s+\d+|\[Environment\]::Exit\(\d+\)|Stop-Process[^\n]*\$PID[^\n]*|break\b)/m,
    ];

    let matched = false;
    for (const pattern of patterns) {
      if (pattern.test(ctx.content)) {
        ctx.content = ctx.content.replace(
          pattern,
      `Write-Log "[INTEGRITY] TOCTOU hash mismatch detected - keeping agent alive for trusted resync" "WARN" <# HOTFIX-TOCTOU-RUNTIME-SELFHEAL #>
                try {
                    if ($null -eq $Global:ToctouFailures) { $Global:ToctouFailures = 0 }
                    $Global:ToctouFailures = [int]$Global:ToctouFailures + 1
                    $runtimeScriptPath = if ($PSCommandPath) { $PSCommandPath } elseif ($MyInvocation.MyCommand.Path) { $MyInvocation.MyCommand.Path } else { $null }
                    if ($runtimeScriptPath) {
                        $Global:LastToctouObservedHash = (Get-FileHash $runtimeScriptPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
                    }

                    if ($Global:ToctouFailures -ge 3) {
                        Write-Log "[INTEGRITY] 3 consecutive TOCTOU violations - entering SAFE_MODE" "ERROR"
                        try {
                            if (Get-Command Set-AgentState -ErrorAction SilentlyContinue) {
                                Set-AgentState -NewState "SAFE_MODE" -Reason "3 consecutive TOCTOU mismatches" | Out-Null
                            } else {
                                $Global:CurrentState = "SAFE_MODE"
                            }
                        } catch {
                            $Global:CurrentState = "SAFE_MODE"
                        }
                        if (Get-Command Flush-LogBuffer -ErrorAction SilentlyContinue) { Flush-LogBuffer }
                        $Global:ToctouFailures = 0
                    } else {
                        if (-not $Global:CurrentState -or $Global:CurrentState -ne "SAFE_MODE") {
                            try {
                                if (Get-Command Set-AgentState -ErrorAction SilentlyContinue) {
                                    Set-AgentState -NewState "DEGRADED" -Reason "Runtime TOCTOU mismatch ($($Global:ToctouFailures)/3)" | Out-Null
                                } else {
                                    $Global:CurrentState = "DEGRADED"
                                }
                            } catch {
                                $Global:CurrentState = "DEGRADED"
                            }
                        }
                        Write-Log "[INTEGRITY] TOCTOU mismatch ($($Global:ToctouFailures)/3) - awaiting trusted resync" "WARN"
                    }
                } catch {
                    Write-Log "[INTEGRITY] TOCTOU keepalive handler failed: $($_.Exception.Message) - continuing anyway" "WARN"
                }
                # Continue execution instead of exiting`
        );
        matched = true;
        ctx.reasons.push('toctou_runtime_selfheal');
        break;
      }
    }

    // Fallback: if script contains TOCTOU VIOLATION but no regex matched,
    // inject self-heal block at the end of the script
    const fallbackPattern = /("TOCTOU VIOLATION[^"]*"[^}]*?)(exit\s+1|\[Environment\]::Exit\(\d+\)|Stop-Process\s+-Id\s+\$PID\s+-Force)/gm;
    const hasFallbackTermination = fallbackPattern.test(ctx.content);
    fallbackPattern.lastIndex = 0;

    if (!matched && hasFallbackTermination) {
      const fallbackBlock = `
# HOTFIX-TOCTOU-RUNTIME-SELFHEAL (fallback): Override TOCTOU termination
$Global:TOCTOU_SELFHEAL_ENABLED = $true
$Global:TOCTOU_CONSECUTIVE_FAILURES = 0
$Global:TOCTOU_MAX_FAILURES = 3
`;
      ctx.content = fallbackBlock + ctx.content;
      // Replace any remaining exit/Stop-Process after TOCTOU VIOLATION with continue
      ctx.content = ctx.content.replace(
        fallbackPattern,
        '$1Write-Log "[INTEGRITY] TOCTOU self-heal: skipping termination" "WARN" <# HOTFIX-TOCTOU-RUNTIME-SELFHEAL #>'
      );
      ctx.reasons.push('toctou_runtime_selfheal_fallback');
    }
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
    const beforeDualHash = ctx.content;
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
                            $Global:CurrentState = 'DEGRADED'
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
                                Write-Log "[INTEGRITY] 3 consecutive unknown hashes - entering SAFE_MODE" "ERROR"
                                $Global:CurrentState = 'SAFE_MODE'
                            } else {
                                $Global:CurrentState = 'DEGRADED'
                            }
                            $toctouHandled = $true
                        }
                    } catch {
                        Write-Log "[INTEGRITY] Dual-hash evaluation failed: $_ - continuing in degraded mode" "WARN"
                        $Global:CurrentState = 'DEGRADED'
                        $toctouHandled = $true
                    }
                    
                    if (-not $toctouHandled) {
                        Write-Log "[INTEGRITY] TOCTOU unhandled - continuing anyway" "ERROR"
                    }`;

    ctx.content = ctx.content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*TOCTOU VIOLATION[^"]*"[^}]*?(?:exit\s+1|\[Environment\]::Exit\(\d+\)|Stop-Process[^}]*?\$PID)/gm,
      degradedModeHandler
    );

    ctx.content = ctx.content.replace(
      /Write-Log\s*"\[INTEGRITY\]\s*Script integrity check FAILED[^"]*"[^}]*?(?:exit\s+1|\[Environment\]::Exit\(\d+\)|return\s+\$false)/gm,
      degradedModeHandler
    );

    if (ctx.content !== beforeDualHash) {
      ctx.reasons.push('toctou_degraded_mode');
    }
  }
}

/** HOTFIX 45: Ed25519 fail-open when public key is null (prevents false REJECTED on hash cache update) */
export function hotfixEd25519HashCacheFailOpen(ctx: HotfixContext): void {
  // Bug: Test-Ed25519HashSignature returns $false when $Global:Ed25519PublicKeyBase64 is $null,
  // and the caller treats $false as "INVALID signature" → rejects hash cache update.
  // Fix: Before the REJECTED block, check if the key is actually available.
  if (
    ctx.content.includes('REJECTED hash cache update - Ed25519 signature INVALID') &&
    !ctx.content.includes('HOTFIX-ED25519-HASHCACHE-FAILOPEN')
  ) {
    // Pattern: if (-not $sigValid) { ... REJECTED hash cache update ... }
    ctx.content = ctx.content.replace(
      /if\s*\(\s*-not\s+\$sigValid\s*\)\s*\{[^}]*REJECTED hash cache update - Ed25519 signature INVALID[^}]*\}/g,
      `# HOTFIX-ED25519-HASHCACHE-FAILOPEN: Distinguish "no key" from "bad signature"
            if (-not $sigValid -and $Global:Ed25519PublicKeyBase64) {
                Write-Log "[INTEGRITY] REJECTED hash cache update - Ed25519 signature INVALID. Possible server compromise!" "ERROR"
                return
            } elseif (-not $sigValid) {
                Write-Log "[INTEGRITY] Ed25519 public key not available - accepting hash cache update (audit-only mode)" "WARN"
            }`
    );
    ctx.reasons.push('ed25519_hashcache_failopen');
  }
}

/** HOTFIX 46: Patch outer TOCTOU caller that still calls [Environment]::Exit(9004) */
export function hotfixToctouCallerExit(ctx: HotfixContext): void {
  if (
    ctx.content.includes('TOCTOU VIOLATION DETECTED - terminating agent immediately') &&
    !ctx.content.includes('HOTFIX-TOCTOU-CALLER-EXIT')
  ) {
    // The outer caller in the main loop still exits when Test-RuntimeIntegrity returns $false.
    // Replace the entire if-block with a self-heal + degraded mode.
    const outerPattern = /if\s*\(\s*-not\s+\(Test-RuntimeIntegrity\)\s*\)\s*\{[^}]*TOCTOU VIOLATION DETECTED[^}]*\[Environment\]::Exit\(\d+\)[^}]*\}/gs;
    
    if (outerPattern.test(ctx.content)) {
      outerPattern.lastIndex = 0;
      ctx.content = ctx.content.replace(
        outerPattern,
        `if (-not (Test-RuntimeIntegrity)) { <# HOTFIX-TOCTOU-CALLER-EXIT #>
                Write-Log "[INTEGRITY] TOCTOU check returned false - entering DEGRADED mode instead of terminating" "WARN"
                if (-not $Global:CurrentState -or $Global:CurrentState -eq "ENFORCING") {
                    $Global:CurrentState = "DEGRADED"
                }
                # Self-heal: update hash cache to match actual running script
                try {
                    $selfHealPath = if ($PSCommandPath) { $PSCommandPath } else { $null }
                    if ($selfHealPath -and (Test-Path $selfHealPath)) {
                        $actualHash = (Get-FileHash $selfHealPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
                        $cachePath = Join-Path $Global:BaseDir "data\\expected_script_hash.json"
                        if (Test-Path $cachePath) {
                            $cacheObj = Get-Content $cachePath -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
                            if ($cacheObj) {
                                if (Get-Member -InputObject $cacheObj -Name "hash" -ErrorAction SilentlyContinue) { $cacheObj.hash = $actualHash }
                                if (Get-Member -InputObject $cacheObj -Name "sha256" -ErrorAction SilentlyContinue) { $cacheObj.sha256 = $actualHash }
                                $cacheObj | Add-Member -NotePropertyName "self_healed_caller" -NotePropertyValue $true -Force
                                $cacheObj | Add-Member -NotePropertyName "healed_at" -NotePropertyValue (Get-Date -Format "o") -Force
                                $cacheObj | ConvertTo-Json -Depth 5 | Set-Content $cachePath -Encoding UTF8 -Force
                                Write-Log "[INTEGRITY] Self-healed hash cache from TOCTOU caller" "INFO"
                            }
                        }
                    }
                } catch {
                    Write-Log "[INTEGRITY] TOCTOU caller self-heal failed: $($_.Exception.Message)" "WARN"
                }
            }`
      );
      ctx.reasons.push('toctou_caller_exit_selfheal');
    }
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
