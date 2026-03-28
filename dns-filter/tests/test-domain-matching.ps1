# CyberShield DNS Filter - Domain Matching Unit Tests
# Tests the critical false-positive prevention logic

$ErrorActionPreference = "Stop"

Write-Host "`n=== DOMAIN MATCHING UNIT TESTS ===" -ForegroundColor Cyan
Write-Host "Testing false-positive prevention logic`n"

# Simulate the Go domain matching logic in PowerShell for validation
function Test-DomainMatches {
    param(
        [string]$Domain,
        [string]$Pattern
    )
    
    # Normalize
    $domain = $Domain.TrimEnd('.').ToLower()
    $pattern = $Pattern.TrimEnd('.').ToLower()
    
    # Wildcard: *.tiktok.com
    if ($pattern.StartsWith("*.")) {
        $baseDomain = $pattern.Substring(2)  # tiktok.com
        
        # Exact match with base
        if ($domain -eq $baseDomain) { return $true }
        
        # Subdomain match: api.tiktok.com ends with .tiktok.com
        if ($domain.EndsWith(".$baseDomain")) { return $true }
        
        return $false
    }
    
    # Exact match
    if ($domain -eq $pattern) { return $true }
    
    # Subdomain match: www.facebook.com matches facebook.com
    if ($domain.EndsWith(".$pattern")) { return $true }
    
    return $false
}

$testCases = @(
    # SHOULD BLOCK (true positives)
    @{ Domain = "facebook.com"; Pattern = "facebook.com"; Expected = $true; Reason = "Exact match" }
    @{ Domain = "www.facebook.com"; Pattern = "facebook.com"; Expected = $true; Reason = "Subdomain" }
    @{ Domain = "api.facebook.com"; Pattern = "facebook.com"; Expected = $true; Reason = "Subdomain" }
    @{ Domain = "m.facebook.com"; Pattern = "facebook.com"; Expected = $true; Reason = "Subdomain" }
    @{ Domain = "login.facebook.com"; Pattern = "facebook.com"; Expected = $true; Reason = "Subdomain" }
    @{ Domain = "deep.sub.facebook.com"; Pattern = "facebook.com"; Expected = $true; Reason = "Deep subdomain" }
    
    # Wildcard tests
    @{ Domain = "tiktok.com"; Pattern = "*.tiktok.com"; Expected = $true; Reason = "Wildcard base" }
    @{ Domain = "www.tiktok.com"; Pattern = "*.tiktok.com"; Expected = $true; Reason = "Wildcard match" }
    @{ Domain = "api.tiktok.com"; Pattern = "*.tiktok.com"; Expected = $true; Reason = "Wildcard match" }
    @{ Domain = "cdn.tiktok.com"; Pattern = "*.tiktok.com"; Expected = $true; Reason = "Wildcard match" }
    
    # SHOULD NOT BLOCK (false positives to prevent)
    @{ Domain = "evilfacebook.com"; Pattern = "facebook.com"; Expected = $false; Reason = "NOT subdomain - different domain" }
    @{ Domain = "notfacebook.com"; Pattern = "facebook.com"; Expected = $false; Reason = "NOT subdomain - different domain" }
    @{ Domain = "myfacebook.com"; Pattern = "facebook.com"; Expected = $false; Reason = "NOT subdomain - different domain" }
    @{ Domain = "facebook.com.evil.com"; Pattern = "facebook.com"; Expected = $false; Reason = "facebook.com is subdomain here" }
    @{ Domain = "fakefacebook.com"; Pattern = "facebook.com"; Expected = $false; Reason = "Different domain" }
    @{ Domain = "facebook-login.com"; Pattern = "facebook.com"; Expected = $false; Reason = "Different domain with hyphen" }
    @{ Domain = "facebookk.com"; Pattern = "facebook.com"; Expected = $false; Reason = "Typosquat domain" }
    
    # Wildcard false positives
    @{ Domain = "tiktokclone.com"; Pattern = "*.tiktok.com"; Expected = $false; Reason = "NOT tiktok.com subdomain" }
    @{ Domain = "faketiktok.com"; Pattern = "*.tiktok.com"; Expected = $false; Reason = "NOT tiktok.com subdomain" }
    @{ Domain = "tiktok.com.evil.com"; Pattern = "*.tiktok.com"; Expected = $false; Reason = "tiktok.com is subdomain here" }
    
    # Edge cases
    @{ Domain = "FACEBOOK.COM"; Pattern = "facebook.com"; Expected = $true; Reason = "Case insensitive" }
    @{ Domain = "facebook.com."; Pattern = "facebook.com"; Expected = $true; Reason = "Trailing dot normalized" }
    @{ Domain = "google.com"; Pattern = "facebook.com"; Expected = $false; Reason = "Unrelated domain" }
)

$passed = 0
$failed = 0

foreach ($test in $testCases) {
    $result = Test-DomainMatches -Domain $test.Domain -Pattern $test.Pattern
    $success = $result -eq $test.Expected
    
    if ($success) {
        $passed++
        $icon = "?"
        $color = "Green"
    } else {
        $failed++
        $icon = "?"
        $color = "Red"
    }
    
    $expectedStr = if ($test.Expected) { "BLOCK" } else { "ALLOW" }
    $actualStr = if ($result) { "BLOCK" } else { "ALLOW" }
    
    Write-Host "$icon [$expectedStr] $($test.Domain) vs $($test.Pattern)" -ForegroundColor $color
    if (-not $success) {
        Write-Host "   Expected: $expectedStr, Got: $actualStr - $($test.Reason)" -ForegroundColor Red
    }
}

Write-Host "`n=== RESULTS ===" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

$criticalFalsePositives = $testCases | Where-Object { -not $_.Expected } | ForEach-Object {
    $result = Test-DomainMatches -Domain $_.Domain -Pattern $_.Pattern
    if ($result) { $_ }
}

if ($criticalFalsePositives) {
    Write-Host "`n[WARN]  CRITICAL: False positives detected!" -ForegroundColor Red
    $criticalFalsePositives | ForEach-Object {
        Write-Host "   $($_.Domain) incorrectly blocked by $($_.Pattern)" -ForegroundColor Red
    }
    exit 1
}

if ($failed -eq 0) {
    Write-Host "`n? All domain matching tests passed" -ForegroundColor Green
    Write-Host "  False-positive prevention: VERIFIED" -ForegroundColor Green
    exit 0
} else {
    exit 1
}
