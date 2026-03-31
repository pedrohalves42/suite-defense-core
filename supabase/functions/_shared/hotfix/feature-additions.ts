import type { HotfixContext } from './types.ts';

/** HOTFIX 14: Fail-open signature verification */
export function hotfixFailopenUnsigned(ctx: HotfixContext): void {
  if (ctx.content.includes('REJECTED - No cryptographic signature') && !ctx.content.includes('HOTFIX-FAILOPEN-UNSIGNED')) {
    ctx.content = ctx.content.replace(
      /if\s*\(-not\s+\$updateSignature\)\s*\{[^}]*REJECTED - No cryptographic signature[^}]*\}/g,
      `# HOTFIX-FAILOPEN-UNSIGNED: Allow null-signature updates when Ed25519 is unavailable
            if (-not $updateSignature -and -not $Global:Ed25519PublicKeyBase64) {
                Write-Log "[FORCE UPDATE] No signature provided AND Ed25519 not available - accepting update based on SHA256 validation" "WARN"
            } elseif (-not $updateSignature) {
                Write-Log "[FORCE UPDATE] REJECTED - No cryptographic signature on update payload. Unsigned updates are no longer accepted." "ERROR"
                return
            }`
    );
    ctx.reasons.push('failopen_unsigned_updates');
  }
}

/** HOTFIX 14b: Fail-open for non-null signatures that fail Ed25519 */
export function hotfixFailopenSig(ctx: HotfixContext): void {
  if (ctx.content.includes('Test-Ed25519HashSignature -Hash $actualHash') && !ctx.content.includes('HOTFIX-FAILOPEN-SIG')) {
    ctx.content = ctx.content.replace(
      /\$sigValid\s*=\s*Test-Ed25519HashSignature\s+-Hash\s+\$actualHash\s+-SignatureBase64\s+\$updateSignature\s*\r?\n\s*if\s*\(-not\s+\$sigValid\)\s*\{/g,
      `$sigValid = Test-Ed25519HashSignature -Hash $actualHash -SignatureBase64 $updateSignature
            # HOTFIX-FAILOPEN-SIG: If Ed25519 is not available (PS 5.1), trust SHA256 validation
            if (-not $sigValid -and -not $Global:Ed25519PublicKeyBase64) {
                Write-Log "[FORCE UPDATE] Ed25519 not available - accepting update based on SHA256 validation" "WARN"
                $sigValid = $true
            }
            if (-not $sigValid) {`
    );
    ctx.reasons.push('failopen_signature_verification');
  }
}

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
