# Agent Digital Signature Validation Guide

## Overview

CyberShield uses ECDSA P-256 (secp256r1) with SHA-256 to cryptographically sign all agent releases, ensuring:

- **Non-repudiation**: Proves the release was signed by an authorized party
- **Integrity**: Ensures the script wasn't modified after signing
- **Supply chain security**: Agent validates signature before execution

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SIGNING FLOW                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │  Script  │ ──►│  SHA256  │ ──►│  ECDSA   │ ──►│ Database │      │
│  │ Content  │    │   Hash   │    │   Sign   │    │  Store   │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│                                       │                             │
│                               Private Key                           │
│                          (Stored Securely)                          │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                      VALIDATION FLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Download │ ──►│  SHA256  │ ──►│  ECDSA   │ ──►│ Execute  │      │
│  │  Script  │    │   Hash   │    │  Verify  │    │ or Abort │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│                                       │                             │
│                               Public Key                            │
│                          (Embedded in Agent)                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Management

### Generate Keypair

```bash
# Via Edge Function (super_admin required)
curl -X POST "${SUPABASE_URL}/functions/v1/sign-release?action=generate-keypair" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "public_key": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...",
  "private_key": "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEH...",
  "fingerprint": "A1B2C3D4E5F67890",
  "algorithm": "ECDSA-P256-SHA256",
  "warning": "Store private_key securely. It will NOT be shown again."
}
```

### Store Keys Securely

1. **Private Key**: Store in a secure vault (HashiCorp Vault, AWS Secrets Manager, etc.)
2. **Public Key**: Embed in agent script and store in database for verification

## Signing a Release

### Option 1: Sign and Register (Recommended)

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/sign-release?action=sign-and-register" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "windows",
    "version": "v3.11.0",
    "script_content": "<# CyberShield Agent ... #>",
    "private_key": "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEH...",
    "release_notes": "Signed production release"
  }'
```

### Option 2: Sign Separately

```bash
# First sign the SHA256 hash
curl -X POST "${SUPABASE_URL}/functions/v1/sign-release?action=sign" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "sha256": "abc123...",
    "private_key": "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEH..."
  }'

# Then register with signature
curl -X POST "${SUPABASE_URL}/functions/v1/register-agent-release" \
  -H "Authorization: Bearer ${ADMIN_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "windows",
    "version": "v3.11.0",
    "script_content": "...",
    "signature_base64": "MEUCIQDx...",
    "signed_by": "admin@company.com"
  }'
```

## Agent-Side Validation (PowerShell)

Add this validation function to the agent script:

```powershell
# Public key (Base64 SPKI format - embed in agent)
$RELEASE_PUBLIC_KEY = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..."

function Test-ReleaseSignature {
    param(
        [string]$ScriptContent,
        [string]$ExpectedSHA256,
        [string]$SignatureBase64,
        [string]$PublicKeyBase64 = $RELEASE_PUBLIC_KEY
    )
    
    try {
        # 1. Verify SHA256 matches content
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ScriptContent)
        $hashBytes = $sha256.ComputeHash($contentBytes)
        $calculatedHash = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
        
        if ($calculatedHash -ne $ExpectedSHA256.ToLower()) {
            Write-Error "SHA256 mismatch! Content may be corrupted."
            return $false
        }
        
        # 2. Verify ECDSA signature
        $publicKeyBytes = [Convert]::FromBase64String($PublicKeyBase64)
        $signatureBytes = [Convert]::FromBase64String($SignatureBase64)
        $hashBytesForSign = [System.Text.Encoding]::UTF8.GetBytes($ExpectedSHA256)
        
        # Import public key
        $ecdsa = [System.Security.Cryptography.ECDsa]::Create()
        $ecdsa.ImportSubjectPublicKeyInfo($publicKeyBytes, [ref]$null)
        
        # Verify signature (hash the SHA256 string, not the raw hash)
        $valid = $ecdsa.VerifyData(
            $hashBytesForSign,
            $signatureBytes,
            [System.Security.Cryptography.HashAlgorithmName]::SHA256
        )
        
        if (-not $valid) {
            Write-Error "ECDSA signature verification FAILED! Release may be tampered."
            return $false
        }
        
        Write-Host "✓ Release signature verified successfully" -ForegroundColor Green
        return $true
        
    } catch {
        Write-Error "Signature validation error: $_"
        return $false
    }
}

# Usage in auto-update flow:
function Apply-SignedUpdate {
    param($UpdateResponse)
    
    $verified = Test-ReleaseSignature `
        -ScriptContent $UpdateResponse.script_content `
        -ExpectedSHA256 $UpdateResponse.sha256 `
        -SignatureBase64 $UpdateResponse.signature_base64
    
    if (-not $verified) {
        Write-Error "SECURITY: Refusing to apply unverified update!"
        # Log security event
        Send-SecurityAlert -Type "SIGNATURE_VERIFICATION_FAILED" -Version $UpdateResponse.version
        return $false
    }
    
    # Proceed with update...
    Write-Host "Applying verified update..."
    return $true
}
```

## Database Schema

The `agent_releases` table stores signatures:

| Column | Type | Description |
|--------|------|-------------|
| sha256 | text | SHA256 hash of script_content |
| signature_base64 | text | ECDSA signature (Base64) |
| signed_at | timestamptz | When the release was signed |
| signed_by | text | Email of signer |

## Security Invariants

### INV-010: Signed Releases

All active production releases MUST have:
- Valid `sha256` hash
- Non-null `signature_base64`
- Verifiable ECDSA signature

```sql
-- View to check signature status
SELECT 
  version,
  platform,
  sha256 IS NOT NULL AS has_hash,
  signature_base64 IS NOT NULL AS has_signature,
  signed_by,
  signed_at
FROM agent_releases
WHERE is_active = true;
```

## Verification Endpoint

Agents or external systems can verify signatures:

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/sign-release?action=verify" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "sha256": "abc123...",
    "signature_base64": "MEUCIQDx...",
    "public_key": "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..."
  }'
```

Response:
```json
{
  "valid": true,
  "fingerprint": "A1B2C3D4E5F67890",
  "algorithm": "ECDSA-P256-SHA256",
  "verified_at": "2025-01-15T10:30:00.000Z"
}
```

## Compliance Mapping

| Standard | Requirement | How We Meet It |
|----------|-------------|----------------|
| SOC2 CC6.1 | Logical access controls | ECDSA keypair with super_admin restriction |
| SOC2 CC7.1 | Change management | Signatures provide audit trail |
| ISO 27001 A.12.5 | Installation of software | Cryptographic verification before execution |
| NIST 800-53 SI-7 | Software integrity | SHA256 + ECDSA signature validation |

## Troubleshooting

### Signature Verification Failed

1. Check SHA256 matches the script content
2. Verify public key is correct (check fingerprint)
3. Ensure signature was created with matching private key
4. Check for encoding issues (Base64 format)

### "Missing signature" Error

Release was registered without signing. Re-register using `sign-and-register` action.

### Key Rotation

1. Generate new keypair
2. Update public key in all deployed agents
3. Re-sign and register new releases
4. Monitor for verification failures during transition
