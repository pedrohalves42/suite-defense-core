/**
 * Hotfix: Process baseline dedup, load, normalize, registry snapshot
 */
import type { HotfixContext } from './types.ts';

/** HOTFIX 32: Deduplicate 'first_seen' in ProcessBaseline */
export function hotfixBaselineDedup(ctx: HotfixContext): void {
  if (ctx.content.includes('first_seen') && !ctx.content.includes('HOTFIX-BASELINE-DEDUP')) {
    if (ctx.content.includes('Add-Member')) {
      ctx.content = ctx.content.replace(
        /Add-Member\s+-(?:NotePropertyName|MemberType\s+NoteProperty\s+-Name)\s+["']?first_seen["']?\s+-(?:NotePropertyValue|Value)\s+/g,
        'Add-Member -NotePropertyName "first_seen" -NotePropertyValue '
      );
      ctx.content = ctx.content.replace(
        /Add-Member\s+-NotePropertyName\s+"first_seen"\s+-NotePropertyValue\s+([^-\n]+?)(?!\s*-Force)(\s*(?:\n|$|<#))/g,
        'Add-Member -NotePropertyName "first_seen" -NotePropertyValue $1 -Force -ErrorAction SilentlyContinue <# HOTFIX-BASELINE-DEDUP #>$2'
      );
    }
    ctx.content = ctx.content.replace(
      /\$(?:Global:)?ProcessBaseline\[([^\]]+)\]\s*=\s*\$proc(?!\s*<#\s*HOTFIX)/g,
      '$Global:ProcessBaseline[$1] = $proc <# HOTFIX-BASELINE-DEDUP #>'
    );
    ctx.content = ctx.content.replace(
      /\.Add\(\s*["']first_seen["']\s*,/g,
      '["first_seen"] = <# HOTFIX-BASELINE-DEDUP-ADD #>'
    );
    if (ctx.content.includes('Detect-ProcessAnomalies') && !ctx.content.includes('HOTFIX-BASELINE-DEDUP-TRYCATCH')) {
      ctx.content = ctx.content.replace(
        /function\s+Detect-ProcessAnomalies\s*\{([\s\S]*?)(\n\s*function\s|\n\s*#\s*={3,})/,
        (match, body, next) => {
          return `function Detect-ProcessAnomalies { <# HOTFIX-BASELINE-DEDUP-TRYCATCH #>\n    try {${body}\n    } catch {\n        Write-Log "[BASELINE] Process anomaly detection error (non-fatal): $($_.Exception.Message)" "WARN"\n        return @()\n    }\n${next}`;
        }
      );
    }
    ctx.reasons.push('baseline_dedup');
  }
}

/** HOTFIX 34: Robust baseline loading */
export function hotfixBaselineLoadSafe(ctx: HotfixContext): void {
  if (ctx.content.includes('Initialize-ProcessBaseline') && ctx.content.includes('ConvertFrom-Json') && !ctx.content.includes('HOTFIX-BASELINE-LOAD-SAFE')) {
    const updated = ctx.content.replace(
      /\$Global:ProcessBaseline\s*=\s*Get-Content\s+\$Global:ProcessBaselinePath\s+-Raw\s*\|\s*ConvertFrom-Json/,
      `# HOTFIX-BASELINE-LOAD-SAFE: Robust JSON loading for PS 5.1 compatibility
            try {
                $rawJson = Get-Content $Global:ProcessBaselinePath -Raw
                $loaded = $rawJson | ConvertFrom-Json
                if ($loaded -is [array]) {
                    $Global:ProcessBaseline = $loaded
                } else {
                    $Global:ProcessBaseline = @($loaded)
                }
            } catch {
                Write-Log "[BASELINE] Corrupted baseline JSON detected: $($_.Exception.Message). Rebuilding..." "WARN"
                try {
                    $backupPath = "$($Global:ProcessBaselinePath).corrupt.$((Get-Date).ToString('yyyyMMddHHmmss'))"
                    Move-Item -Path $Global:ProcessBaselinePath -Destination $backupPath -Force -ErrorAction SilentlyContinue
                } catch { <# ignore #> }
                $Global:ProcessBaseline = @()
                # Force rebuild below
            }`
    );
    if (updated !== ctx.content) {
      ctx.content = updated;
      ctx.reasons.push('baseline_load_safe');
    }
  }
}

/** HOTFIX 35 (baseline): Normalize baseline entries before save */
export function hotfixBaselineNormalizeSave(ctx: HotfixContext): void {
  if (ctx.content.includes('ConvertTo-Json -Depth 5') && ctx.content.includes('ProcessBaselinePath') && !ctx.content.includes('HOTFIX-BASELINE-NORMALIZE-SAVE')) {
    ctx.content = ctx.content.replace(
      /\$Global:ProcessBaseline\s*\|\s*ConvertTo-Json\s+-Depth\s+5\s*\|\s*Out-File\s+\$Global:ProcessBaselinePath[^\n]*/g,
      `# HOTFIX-BASELINE-NORMALIZE-SAVE: Convert all entries to hashtables before save
                $normalizedBaseline = @()
                foreach ($be in $Global:ProcessBaseline) {
                    $normalizedBaseline += @{
                        name = if ($be -is [hashtable]) { $be["name"] } else { $be.name }
                        company = if ($be -is [hashtable]) { $be["company"] } else { $be.company }
                        description = if ($be -is [hashtable]) { $be["description"] } else { $be.description }
                        first_seen = if ($be -is [hashtable]) { $be["first_seen"] } else { $be.first_seen }
                    }
                }
                $normalizedBaseline | ConvertTo-Json -Depth 5 | Out-File $Global:ProcessBaselinePath -Encoding UTF8`
    );
    ctx.reasons.push('baseline_normalize_save');
  }
}

/** HOTFIX 35 (registry): Registry snapshot */
export function hotfixRegistrySnapshot(ctx: HotfixContext): void {
  if (
    ctx.content.includes('if ($Global:EDRInitialized)') &&
    ctx.content.includes('$currentRegSnapshot[$snapKey]') &&
    !ctx.content.includes('HOTFIX-REGISTRY-SNAPSHOT')
  ) {
    if (!ctx.content.includes('$Global:EDRRegistryCycleCount')) {
      const counterDecl = '\n$Global:EDRRegistryCycleCount = 0 # HOTFIX-REGISTRY-SNAPSHOT cycle counter';
      ctx.content = ctx.content.replace(
        /(\$Global:EDRLastRegistrySnapshot = @\{\})/,
        '$1' + counterDecl
      );
    }

    const registryHotfix = ctx.content.replace(
      /# ?? 4\. REGISTRY TELEMETRY \(persistence keys\) ??\s*\r?\n\s*try \{[\s\S]*?\$currentRegSnapshot\[\$snapKey\] = @\{ key_path = \$regKey; value_name = \$prop\.Name; value_data = \[string\]\$prop\.Value \}\s*\r?\n\s*(?:\r?\n\s*)?if \(\$Global:EDRInitialized\) \{/m,
      `# ?? 4. REGISTRY TELEMETRY (persistence keys) ?? # HOTFIX-REGISTRY-SNAPSHOT
    try {
        $currentRegSnapshot = @{}
        $Global:EDRRegistryCycleCount++
        $isSnapshotCycle = (-not $Global:EDRInitialized) -or ($Global:EDRRegistryCycleCount % 15 -eq 0)
        foreach ($regKey in $Global:EDRRegistryKeys) {
            if (-not (Test-Path $regKey -ErrorAction SilentlyContinue)) { continue }
            try {
                $values = Get-ItemProperty -Path $regKey -ErrorAction SilentlyContinue
                if ($values) {
                    $props = $values.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' }
                    foreach ($prop in $props) {
                        $snapKey = "$regKey\\$($prop.Name)"
                        $currentRegSnapshot[$snapKey] = @{ key_path = $regKey; value_name = $prop.Name; value_data = [string]$prop.Value }
                        
                        if ($isSnapshotCycle) {
                            $registryEvents += @{
                                event_type       = "registry_snapshot"
                                key_path         = $regKey
                                value_name       = $prop.Name
                                value_data       = [string]$prop.Value
                                value_type       = "REG_SZ"
                                old_value_data   = $null
                                process_name     = $null
                                process_pid      = $null
                                is_suspicious    = $false
                                detection_tags   = @()
                                mitre_technique_id = $null
                                event_time       = $nowStr
                            }
                        } elseif ($Global:EDRInitialized) {`
    );

    if (registryHotfix !== ctx.content) {
      ctx.content = registryHotfix;
      ctx.reasons.push('registry_snapshot_hotfix');
    }
  }
}
