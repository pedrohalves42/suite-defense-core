import type { HotfixContext } from './types.ts';

/** HOTFIX 1: StrictMode globals (crypto + monitoring) */
export function hotfixStrictModeGlobals(ctx: HotfixContext): void {
  if (
    ctx.content.includes('$Global:SecurityDegraded = $false') &&
    !ctx.content.includes('$Global:AgentPrivateKey = $null')
  ) {
    const globalsBlock = '\n\n# v5.0.14-hotfix: Declare ALL globals early (StrictMode-safe)\n$Global:AgentPrivateKey = $null\n$Global:AgentPublicKey = $null\n$Global:KeyFingerprint = $null\n$Global:KeyVersion = 0\n$Global:ProtectedProcessSet = $null\n$Global:ProcessBaseline = @{}\n$Global:LastBaselineUpdate = [datetime]::MinValue\n$Global:LastAnomalyCheck = [datetime]::MinValue\n$Global:AnomalyHistory = @()\n$Global:LogBuffer = [System.Collections.Generic.List[string]]::new()\n$Global:LastLogFlush = [datetime]::UtcNow\n$Global:CachedTimestamp = $null\n$Global:LastTimestampUpdate = [datetime]::MinValue';

    let withDeclaredGlobals = ctx.content.replace(
      /# v5\.0\.13-fix: SecurityDegraded flag \(BUG 7 - declare early for robustness\)\s*\r?\n\$Global:SecurityDegraded = \$false/,
      '# v5.0.13-fix: SecurityDegraded flag (BUG 7 - declare early for robustness)\n$Global:SecurityDegraded = $false' + globalsBlock
    );

    if (withDeclaredGlobals === ctx.content) {
      withDeclaredGlobals = ctx.content.replace(
        /(\$Global:SecurityDegraded = \$false[^\r\n]*)/,
        '$1' + globalsBlock
      );
    }

    if (withDeclaredGlobals !== ctx.content) {
      ctx.content = withDeclaredGlobals;
      ctx.reasons.push('strictmode_globals');
    }
  }
}

/** HOTFIX 5: $Global:ProcessBaseline not declared - StrictMode crash (safety net) */
export function hotfixBaselineGlobals(ctx: HotfixContext): void {
  if (
    ctx.content.includes('$Global:ProcessBaseline') && 
    !ctx.content.includes('HOTFIX-BASELINE-GLOBALS') && 
    !ctx.content.includes('$Global:ProcessBaseline = @{}')
  ) {
    const baselineGlobals = `\n# HOTFIX-BASELINE-GLOBALS: Declare monitoring globals early for StrictMode\n` +
      `$Global:ProcessBaseline = @{}\n` +
      `$Global:LastBaselineUpdate = [datetime]::MinValue\n` +
      `$Global:LastAnomalyCheck = [datetime]::MinValue\n` +
      `$Global:AnomalyHistory = @()\n` +
      `$Global:ProtectedProcessSet = $null\n`;

    let injected = false;
    if (ctx.content.includes('$Global:SecurityDegraded = $false')) {
      const updated = ctx.content.replace(
        /(\$Global:SecurityDegraded = \$false[^\r\n]*)/,
        '$1' + baselineGlobals
      );
      if (updated !== ctx.content) {
        ctx.content = updated;
        injected = true;
      }
    }
    if (!injected && ctx.content.includes('Set-StrictMode')) {
      ctx.content = ctx.content.replace(
        /(Set-StrictMode[^\r\n]*)/,
        '$1' + baselineGlobals
      );
    }
    ctx.reasons.push('baseline_globals');
  }
}

/** HOTFIX 11: Initialize $Global:ProtectedProcessSet for Invoke-HighCpuProcessCheck */
export function hotfixInitProtectedSet(ctx: HotfixContext): void {
  if (ctx.content.includes('$Global:ProtectedProcessSet') && !ctx.content.includes('HOTFIX-INIT-PROTECTEDSET')) {
    ctx.content = ctx.content.replace(
      /\$Global:ProtectedProcessSet = \$null/,
      '$Global:ProtectedProcessSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase) <# HOTFIX-INIT-PROTECTEDSET #>'
    );
    ctx.reasons.push('init_protected_process_set');
  }
}

/** HOTFIX 26d: Initialize RSA globals early (StrictMode safe) */
export function hotfixRsaGlobalsInit(ctx: HotfixContext): void {
  if (ctx.content.includes('$Global:AgentPrivateKey = $null') && !ctx.content.includes('$Global:AgentRsaKey = $null')) {
    ctx.content = ctx.content.replace(
      /\$Global:AgentPrivateKey = \$null/,
      '$Global:AgentPrivateKey = $null\n$Global:AgentRsaKey = $null\n$Global:AgentSigningAlgorithm = "ECDSA-P256-SHA256"'
    );
    ctx.reasons.push('rsa_globals_init');
  }
}
