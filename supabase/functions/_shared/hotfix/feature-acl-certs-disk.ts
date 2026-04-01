/**
 * Hotfix: ACL SID fix, collect_certificates, collect_disk_metrics, DNS 403
 */
import type { HotfixContext } from './types.ts';

/** HOTFIX 17: ACL hardening uses English names */
export function hotfixAclSid(ctx: HotfixContext): void {
  if (ctx.content.includes('FileSystemAccessRule("SYSTEM"') && !ctx.content.includes('HOTFIX-ACL-SID')) {
    ctx.content = ctx.content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\("SYSTEM",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    ctx.content = ctx.content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\("Administrators",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    ctx.content = ctx.content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*"SYSTEM",\s*"FullControl",\s*"ContainerInherit,ObjectInherit",\s*"None",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","ContainerInherit,ObjectInherit","None","Allow") <# HOTFIX-ACL-SID #>'
    );
    ctx.content = ctx.content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*"Administrators",\s*"FullControl",\s*"ContainerInherit,ObjectInherit",\s*"None",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","ContainerInherit,ObjectInherit","None","Allow") <# HOTFIX-ACL-SID #>'
    );
    ctx.content = ctx.content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*\n\s*"Administrators",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule(\n                (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    ctx.content = ctx.content.replace(
      /New-Object System\.Security\.AccessControl\.FileSystemAccessRule\(\s*\n\s*"SYSTEM",\s*"FullControl",\s*"Allow"\)/g,
      'New-Object System.Security.AccessControl.FileSystemAccessRule(\n                (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>'
    );
    ctx.reasons.push('acl_sid_fix');
  }
}

/** HOTFIX 18: collect_certificates job handler */
export function hotfixCollectCerts(ctx: HotfixContext): void {
  if (ctx.content.includes('default {') && ctx.content.includes('Unknown job type') && !ctx.content.includes('HOTFIX-COLLECT-CERTS')) {
    ctx.content = ctx.content.replace(
      /(\s+)default\s*\{\s*\r?\n\s*\$(?:job_)?error_message\s*=\s*"Unknown job type[^"]*"/,
      `$1"collect_certificates" { <# HOTFIX-COLLECT-CERTS #>
$1    try {
$1        $certs = @(Get-ChildItem -Path Cert:\\LocalMachine\\My -ErrorAction SilentlyContinue)
$1        $certList = @($certs | ForEach-Object {
$1            @{
$1                thumbprint = $_.Thumbprint
$1                subject = $_.Subject
$1                issuer = $_.Issuer
$1                valid_from = $_.NotBefore.ToString("o")
$1                valid_until = $_.NotAfter.ToString("o")
$1                serial_number = $_.SerialNumber
$1                is_self_signed = ($_.Subject -eq $_.Issuer)
$1                cert_store = "LocalMachine\\\\My"
$1            }
$1        })
$1        $output = @{ certificates = $certList; count = $certList.Count; collected_at = (Get-Date).ToString("o") }
$1        Write-Log "[JOB] Collected $($certList.Count) certificates" "INFO"
$1    } catch {
$1        $error_message = "collect_certificates failed: $($_.Exception.Message)"
$1        $status = "failed"
$1    }
$1}
$1default {
$1    $error_message = "Unknown job type: $($Job.job_type)"`
    );
    ctx.reasons.push('collect_certificates_handler');
  }
}

/** HOTFIX 29: collect_disk_metrics job handler */
export function hotfixCollectDisk(ctx: HotfixContext): void {
  if (ctx.content.includes('default {') && ctx.content.includes('Unknown job type') && !ctx.content.includes('HOTFIX-COLLECT-DISK')) {
    ctx.content = ctx.content.replace(
      /(\s+)default\s*\{\s*\r?\n\s*\$(?:job_)?error_message\s*=\s*"Unknown job type[^"]*"/,
      `$1"collect_disk_metrics" { <# HOTFIX-COLLECT-DISK #>
$1    try {
$1        $drives = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue)
$1        $diskList = @($drives | ForEach-Object {
$1            $totalGB = [math]::Round($_.Size / 1GB, 2)
$1            $freeGB = [math]::Round($_.FreeSpace / 1GB, 2)
$1            $usedGB = [math]::Round($totalGB - $freeGB, 2)
$1            $usagePct = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100, 1) } else { 0 }
$1            @{
$1                drive_letter = $_.DeviceID
$1                drive_label = if ($_.VolumeName) { $_.VolumeName } else { "" }
$1                drive_type = "Fixed"
$1                total_gb = $totalGB
$1                free_gb = $freeGB
$1                used_gb = $usedGB
$1                usage_percent = $usagePct
$1                is_system_drive = ($_.DeviceID -eq $env:SystemDrive)
$1            }
$1        })
$1        $output = @{ disks = $diskList; count = @($diskList).Count; collected_at = (Get-Date).ToString("o") }
$1        Write-Log "[JOB] Collected disk metrics for $(@($diskList).Count) drives" "INFO"
$1    } catch {
$1        $error_message = "collect_disk_metrics failed: $($_.Exception.Message)"
$1        $status = "failed"
$1    }
$1}
$1default {
$1    $error_message = "Unknown job type: $($Job.job_type)"`
    );
    ctx.reasons.push('collect_disk_metrics_handler');
  }
}

/** HOTFIX 25: DNS 403 silenciado */
export function hotfixDns403Info(ctx: HotfixContext): void {
  if (ctx.content.includes('Sync-DnsBlocklist') && ctx.content.includes('serve-dns-filter') && !ctx.content.includes('HOTFIX-DNS-403-INFO')) {
    ctx.content = ctx.content.replace(
      /(\$result = Invoke-SecureRequest\s*`[^}]*?serve-dns-filter[^}]*?)\s*\n\s*if \(-not \$result\.Success\) \{\s*\n\s*return \$false\s*\n\s*\}/m,
      `$1

        # HOTFIX-DNS-403-INFO: 403 = feature disabled (not an error)
        if (-not $result.Success) {
            if ($result.StatusCode -eq 403) {
                Write-Log "[DNS] DNS Filter desabilitado para este tenant (403 - feature flag off)" "INFO"
            } else {
                Write-Log "[DNS] Falha ao sincronizar DNS blocklist (HTTP $($result.StatusCode)): $($result.Error)" "WARN"
            }
            return $false
        }`
    );
    ctx.reasons.push('dns_403_info');
  }
}
