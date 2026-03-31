import type { HotfixContext } from './types.ts';

/** HOTFIX 24a: Persist skip_firewall_remediation flag locally */
export function hotfixSkipFwBoot(ctx: HotfixContext): void {
  if (ctx.content.includes('$Global:SkipFirewallRemediation = $false') && !ctx.content.includes('HOTFIX-SKIP-FW-BOOT')) {
    ctx.content = ctx.content.replace(
      /\$Global:SkipFirewallRemediation = \$false[^\r\n]*/,
      `$Global:SkipFirewallRemediation = $false\n# HOTFIX-SKIP-FW-BOOT: Load persisted skip flag from HARDCODED path\ntry {\n    $flagPaths = @("C:\\\\CyberShield\\\\skip_firewall.flag")\n    if ($PSScriptRoot) { $flagPaths += Join-Path $PSScriptRoot "skip_firewall.flag" }\n    foreach ($fp in $flagPaths) { if (Test-Path $fp) { $Global:SkipFirewallRemediation = $true; break } }\n} catch { <# non-fatal #> } <# HOTFIX-SKIP-FW-BOOT #>`
    );
    ctx.reasons.push('skip_firewall_boot_persistence');
  }
}

/** HOTFIX 24b: Persist heartbeat toggle to disk */
export function hotfixSkipFwPersist(ctx: HotfixContext): void {
  if (
    ctx.content.includes('$Global:SkipFirewallRemediation = [bool]$response.skip_firewall_remediation') &&
    !ctx.content.includes('HOTFIX-SKIP-FW-PERSIST')
  ) {
    ctx.content = ctx.content.replace(
      /\$Global:SkipFirewallRemediation = \[bool\]\$response\.skip_firewall_remediation\s*\r?\n/g,
      `$Global:SkipFirewallRemediation = [bool]$response.skip_firewall_remediation\n                        # HOTFIX-SKIP-FW-PERSIST: Persist to HARDCODED C:\\\\CyberShield path\n                        try {\n                            $flagFile = "C:\\\\CyberShield\\\\skip_firewall.flag"\n                            if ($Global:SkipFirewallRemediation) {\n                                "1" | Set-Content -Path $flagFile -Force -ErrorAction SilentlyContinue\n                            } else {\n                                if (Test-Path $flagFile) { Remove-Item $flagFile -Force -ErrorAction SilentlyContinue }\n                            }\n                        } catch { <# non-fatal #> } <# HOTFIX-SKIP-FW-PERSIST #>\n`
    );
    ctx.reasons.push('skip_firewall_runtime_persistence');
  }
}

/** HOTFIX 24h: Inject skip_firewall_remediation reader into Send-Heartbeat response handler */
export function hotfixSkipFwHeartbeatRead(ctx: HotfixContext): void {
  if (
    ctx.content.includes('heartbeat_interval_seconds') &&
    ctx.content.includes('Send-Heartbeat') &&
    !ctx.content.includes('HOTFIX-SKIP-FW-HEARTBEAT-READ')
  ) {
    const skipFwReaderBlock = `
                    # HOTFIX-SKIP-FW-HEARTBEAT-READ: Read skip_firewall_remediation from server
                    if (Get-Member -InputObject $response -Name "skip_firewall_remediation" -ErrorAction SilentlyContinue) {
                        $serverSkipFw = [bool]$response.skip_firewall_remediation
                        if ($serverSkipFw -ne $Global:SkipFirewallRemediation) {
                            Write-Log "[HEARTBEAT] skip_firewall_remediation changed: $($Global:SkipFirewallRemediation) -> $serverSkipFw" "INFO"
                        }
                        $Global:SkipFirewallRemediation = $serverSkipFw
                        try {
                            $fwFlagFile = "C:\\\\CyberShield\\\\skip_firewall.flag"
                            if ($serverSkipFw) {
                                "1" | Set-Content -Path $fwFlagFile -Force -ErrorAction SilentlyContinue
                            } else {
                                if (Test-Path $fwFlagFile) { Remove-Item $fwFlagFile -Force -ErrorAction SilentlyContinue }
                            }
                        } catch { <# non-fatal #> }
                    }
`;
    const pollBlockEnd = ctx.content.match(/\$Global:JobPollIntervalSeconds = \$newJobInterval\s*\r?\n\s*\}\s*\r?\n\s*\}/);
    if (pollBlockEnd) {
      ctx.content = ctx.content.replace(
        /(\$Global:JobPollIntervalSeconds = \$newJobInterval\s*\r?\n\s*\}\s*\r?\n\s*\})/,
        '$1' + skipFwReaderBlock
      );
      ctx.reasons.push('skip_firewall_heartbeat_reader');
    } else {
      const forceUpdateCheck = ctx.content.match(/# ={3,}\s*\r?\n\s*# FORCE UPDATE VIA HEARTBEAT/);
      if (forceUpdateCheck) {
        ctx.content = ctx.content.replace(
          /(# ={3,}\s*\r?\n\s*# FORCE UPDATE VIA HEARTBEAT)/,
          skipFwReaderBlock + '\n                    $1'
        );
        ctx.reasons.push('skip_firewall_heartbeat_reader');
      }
    }
  }
}

/** HOTFIX 24f: Upgrade OLD $PSScriptRoot flag paths to hardcoded */
export function hotfixUpgradeFlagPath(ctx: HotfixContext): void {
  if (ctx.content.includes('Join-Path $PSScriptRoot "skip_firewall.flag"')) {
    ctx.content = ctx.content.replace(
      /Join-Path \$PSScriptRoot "skip_firewall\.flag"/g,
      '"C:\\\\CyberShield\\\\skip_firewall.flag"'
    );
    ctx.reasons.push('upgrade_flag_path_to_hardcoded');
  }
}

/** HOTFIX 24g: Ensure guard also checks flag file on disk */
export function hotfixUpgradeGuardFileCheck(ctx: HotfixContext): void {
  if (
    ctx.content.includes('HOTFIX-SKIP-FW-GUARD') &&
    ctx.content.includes('if ($Global:SkipFirewallRemediation)') &&
    !ctx.content.includes('Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag"')
  ) {
    ctx.content = ctx.content.replace(
      /if \(\$Global:SkipFirewallRemediation\) \{/g,
      'if ($Global:SkipFirewallRemediation -or (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue)) {'
    );
    ctx.reasons.push('upgrade_guard_to_check_file');
  }
}

/** HOTFIX 24d: Guard firewall auto-remediation */
export function hotfixSkipFwGuard(ctx: HotfixContext): void {
  if (ctx.content.includes('Test-FirewallStatus') && !ctx.content.includes('HOTFIX-SKIP-FW-GUARD')) {
    let remedBlock = ctx.content.replace(
      /(function Test-FirewallStatus\s*\{[\s\S]*?\$Global:LocalDetectionStats\.firewall_checks\+\+)/,
      `$1\n        # HOTFIX-SKIP-FW-GUARD: Triple-check skip flag before ANY firewall operation\n        $shouldSkipFw = $false\n        if ($Global:SkipFirewallRemediation -eq $true) { $shouldSkipFw = $true }\n        elseif (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue) { $shouldSkipFw = $true; $Global:SkipFirewallRemediation = $true }`
    );
    
    if (remedBlock !== ctx.content) {
      remedBlock = remedBlock.replace(
        /# AUTO-REMEDIATION: Re-enable disabled firewall profiles\s*\r?\n(\s*)\$remediated = @\(\)/,
        `# AUTO-REMEDIATION: Re-enable disabled firewall profiles\n$1# HOTFIX-SKIP-FW-GUARD: If skip active, return immediately\n$1if ($shouldSkipFw) {\n$1    Write-Log "[LOCAL-DETECT] Firewall disabled but SKIP active (external firewall). NO remediation." "INFO"\n$1    return @{ status = "skipped_external"; disabled_profiles = $disabledProfiles }\n$1}\n$1$remediated = @()`
      );
      ctx.content = remedBlock;
      ctx.reasons.push('skip_firewall_remediation_guard');
    } else {
      remedBlock = ctx.content.replace(
        /(\s*)\$remediated\s*=\s*@\(\)\s*\r?\n(\s*)foreach\s*\(\s*\$profileName\s+in\s+\$disabledProfiles\s*\)\s*\{/,
        `$1# HOTFIX-SKIP-FW-GUARD: Skip if external firewall flag is set\n$1if ($Global:SkipFirewallRemediation -or (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue)) {\n$1    Write-Log "[LOCAL-DETECT] Firewall disabled but SKIP active. NO remediation." "INFO"\n$1    return @{ status = "skipped_external"; disabled_profiles = $disabledProfiles }\n$1}\n$1$remediated = @()\n$2foreach ($profileName in $disabledProfiles) {`
      );
      if (remedBlock !== ctx.content) {
        ctx.content = remedBlock;
        ctx.reasons.push('skip_firewall_remediation_guard');
      } else {
        remedBlock = ctx.content.replace(
          /(\s*)(Set-NetFirewallProfile\s+-Name\s+\$profileName\s+-Enabled\s+True)/g,
          `$1if (-not $Global:SkipFirewallRemediation -and -not (Test-Path "C:\\\\CyberShield\\\\skip_firewall.flag" -ErrorAction SilentlyContinue)) { $2 } else { Write-Log "[LOCAL-DETECT] Skipped firewall re-enable ($profileName) - external firewall" "INFO" } <# HOTFIX-SKIP-FW-GUARD #>`
        );
        if (remedBlock !== ctx.content) {
          ctx.content = remedBlock;
          ctx.reasons.push('skip_firewall_remediation_guard');
        }
      }
    }
  }
}

/** HOTFIX 24e: Initialize $Global:SkipFirewallRemediation from local flag file */
export function hotfixSkipFwInit(ctx: HotfixContext): void {
  if (ctx.content.includes('Test-FirewallStatus') && !ctx.content.includes('HOTFIX-SKIP-FW-INIT')) {
    const needsInit = !ctx.content.includes('$Global:SkipFirewallRemediation');
    const needsFlagCheck = ctx.content.includes('$Global:SkipFirewallRemediation') && !ctx.content.includes('skip_firewall.flag');
    
    if (needsInit || needsFlagCheck) {
      const skipFwInit = `
# HOTFIX-SKIP-FW-INIT: Initialize SkipFirewallRemediation from HARDCODED flag path
$Global:SkipFirewallRemediation = $false
try {
    $skipFwPaths = @("C:\\CyberShield\\skip_firewall.flag")
    if ($PSScriptRoot) { $skipFwPaths += Join-Path $PSScriptRoot "skip_firewall.flag" }
    foreach ($fp in $skipFwPaths) { if (Test-Path $fp) { $Global:SkipFirewallRemediation = $true; break } }
} catch { <# non-fatal #> }
`;
      let injected = false;
      if (ctx.content.includes('$installDir = "C:\\CyberShield"')) {
        const updated = ctx.content.replace(
          /(\$installDir = "C:\\CyberShield"[^\r\n]*)/,
          '$1' + skipFwInit
        );
        if (updated !== ctx.content) { ctx.content = updated; injected = true; }
      }
      if (!injected && ctx.content.includes('$Global:SecurityDegraded')) {
        const updated = ctx.content.replace(
          /(\$Global:SecurityDegraded = \$false[^\r\n]*)/,
          '$1' + skipFwInit
        );
        if (updated !== ctx.content) { ctx.content = updated; injected = true; }
      }
      if (!injected && ctx.content.includes('Invoke-LocalDetection')) {
        const updated = ctx.content.replace(
          /(function Invoke-LocalDetection)/,
          skipFwInit + '\n$1'
        );
        if (updated !== ctx.content) { ctx.content = updated; injected = true; }
      }
      if (injected) {
        ctx.reasons.push('skip_firewall_init');
      }
    }
  }
}
