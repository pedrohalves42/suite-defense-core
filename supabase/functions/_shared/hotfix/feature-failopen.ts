/**
 * Hotfix: Fail-open signature verification (HOTFIX 14, 14b)
 */
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
