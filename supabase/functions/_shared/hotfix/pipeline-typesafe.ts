import type { HotfixContext } from './types.ts';

/** HOTFIX 8: Pipeline-safe Test-* calls in Invoke-LocalDetection */
export function hotfixPipelineSafeTestCalls(ctx: HotfixContext): void {
  if (ctx.content.includes('Test-AntivirusStatus') && !ctx.content.includes('PIPELINE-SAFE')) {
    ctx.content = ctx.content.replace(
      /\$results\.antivirus\s*=\s*Test-AntivirusStatus\b/g,
      '$results.antivirus = @(Test-AntivirusStatus)[-1] <# PIPELINE-SAFE #>'
    );
    ctx.content = ctx.content.replace(
      /\$results\.firewall\s*=\s*Test-FirewallStatus\b/g,
      '$results.firewall = @(Test-FirewallStatus)[-1] <# PIPELINE-SAFE #>'
    );
    ctx.content = ctx.content.replace(
      /\$results\.usb\s*=\s*Test-UsbDevices\b/g,
      '$results.usb = @(Test-UsbDevices)[-1] <# PIPELINE-SAFE #>'
    );
    ctx.content = ctx.content.replace(
      /\$results\.processes\s*=\s*Test-SuspiciousProcesses\b/g,
      '$results.processes = @(Test-SuspiciousProcesses)[-1] <# PIPELINE-SAFE #>'
    );
    ctx.reasons.push('pipeline_safe_test_calls');
  }
}

/** HOTFIX 9: Type-safe .status access */
export function hotfixTypesafeStatus(ctx: HotfixContext): void {
  if (ctx.content.includes('$results.antivirus') && !ctx.content.includes('HOTFIX-TYPESAFE-STATUS')) {
    ctx.content = ctx.content.replace(
      /if\s*\(\$results\.antivirus(?:\s+-and\s+\$results\.antivirus\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.antivirus\.status|\.status)\s+-eq\s+"inactive"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.antivirus -is [hashtable] -and $results.antivirus.status -eq "inactive") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    ctx.content = ctx.content.replace(
      /if\s*\(\$results\.firewall(?:\s+-and\s+\$results\.firewall\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.firewall\.status|\.status)\s+-eq\s+"remediated"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.firewall -is [hashtable] -and $results.firewall.status -eq "remediated") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    ctx.content = ctx.content.replace(
      /if\s*\(\$results\.usb(?:\s+-and\s+\$results\.usb\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.usb\.status|\.status)\s+-eq\s+"detected"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.usb -is [hashtable] -and $results.usb.status -eq "detected") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    ctx.content = ctx.content.replace(
      /if\s*\(\$results\.processes(?:\s+-and\s+\$results\.processes\.status|\s+-is\s+\[hashtable\]\s+-and\s+\$results\.processes\.status|\.status)\s+-eq\s+"detected"\)\s*(?:<#[^#]*#>\s*)?/g,
      'if ($results.processes -is [hashtable] -and $results.processes.status -eq "detected") <# HOTFIX-TYPESAFE-STATUS #> '
    );
    ctx.reasons.push('typesafe_status_access');
  }
}

/** HOTFIX 10: Wrap Invoke-LocalDetection call sites in try/catch */
export function hotfixLocalDetectTryCatch(ctx: HotfixContext): void {
  if (ctx.content.includes('Invoke-LocalDetection') && !ctx.content.includes('HOTFIX-LOCAL-DETECT-TRYCATCH')) {
    ctx.content = ctx.content.replace(
      /^(\s+)(?:try\s*\{\s*)?Invoke-LocalDetection(?:\s*\|\s*Out-Null)?(?:\s*\}[^}]*catch[^}]*\{[^}]*\}\s*(?:<#[^#]*#>)?)?$/gm,
      (match, indent) => {
        if (match.includes('function ')) return match;
        return `${indent}try { Invoke-LocalDetection | Out-Null } catch { Write-Log "[LOCAL-DETECT] Non-fatal error: $($_.Exception.Message)" "WARN" } <# HOTFIX-LOCAL-DETECT-TRYCATCH #>`;
      }
    );
    ctx.reasons.push('local_detect_trycatch');
  }
}

/** HOTFIX 19: .Count on non-array in Test-UsbDevices */
export function hotfixUsbCount(ctx: HotfixContext): void {
  if (ctx.content.includes('$usbDrives.Count') && !ctx.content.includes('HOTFIX-USB-COUNT')) {
    ctx.content = ctx.content.replace(
      /if \(\$usbDrives -and \$usbDrives\.Count -gt 0\)/g,
      'if ($usbDrives -and @($usbDrives).Count -gt 0) <# HOTFIX-USB-COUNT #>'
    );
    ctx.content = ctx.content.replace(
      /count = \$usbDrives\.Count/g,
      'count = @($usbDrives).Count <# HOTFIX-USB-COUNT #>'
    );
    ctx.reasons.push('usb_count_fix');
  }
}

/** HOTFIX 20: .Count on non-array in Get-UnauthorizedSoftware */
export function hotfixSoftwareCount(ctx: HotfixContext): void {
  if (ctx.content.includes('$installedSoftware.Count') && !ctx.content.includes('HOTFIX-SW-COUNT')) {
    ctx.content = ctx.content.replace(
      /total_installed = \$installedSoftware\.Count/g,
      'total_installed = @($installedSoftware).Count <# HOTFIX-SW-COUNT #>'
    );
    ctx.reasons.push('software_count_fix');
  }
}

/** HOTFIX 21: "vv" duplicated version prefix in startup log */
export function hotfixVersionPrefix(ctx: HotfixContext): void {
  if (ctx.content.includes('Agent v$($Global:AgentVersion)')) {
    const updated = ctx.content.replace(
      /Agent v\$\(\$Global:AgentVersion\)/g,
      'Agent $($Global:AgentVersion)'
    );
    if (updated !== ctx.content) {
      ctx.content = updated;
      ctx.reasons.push('version_prefix_fix');
    }
  }
}

/** HOTFIX 23: ConvertTo-Json body serialization mismatch */
export function hotfixBodyCompress(ctx: HotfixContext): void {
  if (
    ctx.content.includes('ConvertTo-Json -Depth 10 }') &&
    ctx.content.includes('ConvertTo-Json -Compress -Depth 10') &&
    !ctx.content.includes('HOTFIX-BODY-COMPRESS')
  ) {
    ctx.content = ctx.content.replace(
      /\$params\.Body = if \(\$Body -is \[string\]\) \{ \$Body \} else \{ \$Body \| ConvertTo-Json -Depth 10 \}/g,
      '$params.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 } <# HOTFIX-BODY-COMPRESS #>'
    );
    ctx.reasons.push('body_compress_fix');
  }
}
