<#
.SYNOPSIS
    Cryptographic functions (ECDSA/RSA key management)
#>

$script:UseECDSA = $false
$script:CryptoProvider = $null

function Initialize-Crypto {
    try {
        $testKey = [System.Security.Cryptography.ECDsaCng]::new(256)
        $null = $testKey.ExportPkcs8PrivateKey()
        $testKey.Dispose()
        $script:UseECDSA = $true
        Write-Log "ECDSA-CNG initialized successfully" "INFO"
        return $true
    }
    catch {
        Write-Log "ECDSA-CNG not available, using RSA fallback: $($_.Exception.Message)" "WARN"
        $script:UseECDSA = $false

        try {
            $script:CryptoProvider = [System.Security.Cryptography.RSACryptoServiceProvider]::new(2048)
            Write-Log "RSA-2048 fallback initialized" "INFO"
            return $true
        }
        catch {
            Write-Log "RSA fallback also failed: $($_.Exception.Message)" "ERROR"
            return $false
        }
    }
}

function Sign-Payload {
    param([string]$Payload)

    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($Payload)

    if ($script:UseECDSA) {
        $key = [System.Security.Cryptography.ECDsaCng]::new(256)
        $sig = $key.SignData($payloadBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
        $key.Dispose()
        return [Convert]::ToBase64String($sig)
    }
    elseif ($script:CryptoProvider) {
        $sig = $script:CryptoProvider.SignData($payloadBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
        return [Convert]::ToBase64String($sig)
    }

    Write-Log "No crypto provider available for signing" "ERROR"
    return $null
}

function Get-PayloadHash {
    param([string]$Payload)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Payload))
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}
