/**
 * Hotfix: Key Distribution via Heartbeat (HOTFIX 46)
 * 
 * Injects logic into the v5.0.15 script to extract ed25519_public_key
 * and rsa_public_key from the heartbeat response, persist them to disk,
 * and set globals — enabling transition from audit-only to full verification.
 */
import type { HotfixContext } from './types.ts';

/**
 * HOTFIX 46: Extract and persist public keys from heartbeat response.
 * 
 * The v5.0.15 script processes the heartbeat JSON response but never
 * extracts ed25519_public_key / rsa_public_key fields. This hotfix
 * injects key extraction right after the skip_firewall_remediation
 * processing block (reliable anchor present in all v5.x scripts).
 */
export function hotfixKeyDistribution(ctx: HotfixContext): void {
  // Guard: only apply if script has heartbeat processing but lacks key extraction
  if (!ctx.content.includes('skip_firewall_remediation') ||
      ctx.content.includes('HOTFIX-KEY-DISTRIBUTION')) {
    return;
  }

  // The v5.0.15 script persists skip_firewall to a flag file.
  // We inject key extraction right after that block.
  // Pattern: matches the Out-File line for skip_firewall.flag
  const anchorPattern = /(skip_firewall(?:_remediation)?[^}]*?Out-File\s+["'][^"']*skip_firewall\.flag["'][^\r\n]*)/;

  if (!anchorPattern.test(ctx.content)) {
    // Fallback anchor: match the "persisted to C:\CyberShield\skip_firewall.flag" log line
    const fallbackPattern = /(Write-Log\s+["'][^"']*skip_firewall\.flag["'][^\r\n]*)/;
    if (!fallbackPattern.test(ctx.content)) {
      return;
    }

    ctx.content = ctx.content.replace(fallbackPattern, (match) => {
      return match + getKeyDistributionBlock();
    });
    ctx.reasons.push('key_distribution_via_heartbeat');
    return;
  }

  ctx.content = ctx.content.replace(anchorPattern, (match) => {
    return match + getKeyDistributionBlock();
  });
  ctx.reasons.push('key_distribution_via_heartbeat');
}

function getKeyDistributionBlock(): string {
  return `
        # HOTFIX-KEY-DISTRIBUTION: Extract and persist public keys from heartbeat response
        try {
            if ($heartbeatResponse.ed25519_public_key -and $heartbeatResponse.ed25519_public_key.Length -gt 10) {
                $Global:Ed25519PublicKeyBase64 = $heartbeatResponse.ed25519_public_key
                try {
                    $heartbeatResponse.ed25519_public_key | Out-File "C:\\CyberShield\\ed25519_pubkey" -Encoding UTF8 -Force -NoNewline
                    Write-Log "[KEY-DIST] Ed25519 public key received and persisted" "SUCCESS"
                } catch {
                    Write-Log "[KEY-DIST] Failed to persist Ed25519 key: $($_.Exception.Message)" "WARN"
                }
            } elseif (-not $Global:Ed25519PublicKeyBase64 -and (Test-Path "C:\\CyberShield\\ed25519_pubkey")) {
                $Global:Ed25519PublicKeyBase64 = (Get-Content "C:\\CyberShield\\ed25519_pubkey" -Raw -EA SilentlyContinue)
                if ($Global:Ed25519PublicKeyBase64) {
                    Write-Log "[KEY-DIST] Ed25519 public key loaded from disk cache" "INFO"
                }
            }
            if ($heartbeatResponse.rsa_public_key -and $heartbeatResponse.rsa_public_key.Length -gt 10) {
                $Global:RsaPublicKeyBase64 = $heartbeatResponse.rsa_public_key
                try {
                    $heartbeatResponse.rsa_public_key | Out-File "C:\\CyberShield\\rsa_pubkey" -Encoding UTF8 -Force -NoNewline
                    Write-Log "[KEY-DIST] RSA public key received and persisted" "SUCCESS"
                } catch {
                    Write-Log "[KEY-DIST] Failed to persist RSA key: $($_.Exception.Message)" "WARN"
                }
            } elseif (-not $Global:RsaPublicKeyBase64 -and (Test-Path "C:\\CyberShield\\rsa_pubkey")) {
                $Global:RsaPublicKeyBase64 = (Get-Content "C:\\CyberShield\\rsa_pubkey" -Raw -EA SilentlyContinue)
                if ($Global:RsaPublicKeyBase64) {
                    Write-Log "[KEY-DIST] RSA public key loaded from disk cache" "INFO"
                }
            }
        } catch {
            Write-Log "[KEY-DIST] Key distribution processing error (non-fatal): $($_.Exception.Message)" "WARN"
        }`;
}
