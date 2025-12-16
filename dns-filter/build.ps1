# CyberShield DNS Filter - Build Script
# Requires: Go 1.21+

param(
    [switch]$Release,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$ProjectName = "cybershield-dns"
$OutputDir = "bin"
$Version = "1.0.0"

Write-Host "=== CyberShield DNS Filter Build ===" -ForegroundColor Cyan

# Clean
if ($Clean) {
    Write-Host "Cleaning..." -ForegroundColor Yellow
    if (Test-Path $OutputDir) {
        Remove-Item -Recurse -Force $OutputDir
    }
    Write-Host "Clean complete" -ForegroundColor Green
    exit 0
}

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# Get dependencies
Write-Host "Getting dependencies..." -ForegroundColor Yellow
go mod download
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get dependencies" -ForegroundColor Red
    exit 1
}

# Build flags
$ldflags = "-X main.version=$Version"
if ($Release) {
    $ldflags = "-s -w -X main.version=$Version"
}

# Build for Windows AMD64
Write-Host "Building for Windows AMD64..." -ForegroundColor Yellow
$env:GOOS = "windows"
$env:GOARCH = "amd64"

$outputFile = Join-Path $OutputDir "$ProjectName.exe"

go build -ldflags $ldflags -o $outputFile .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    exit 1
}

# Calculate SHA256
$hash = (Get-FileHash $outputFile -Algorithm SHA256).Hash
Write-Host "SHA256: $hash" -ForegroundColor Cyan

# Get file size
$size = (Get-Item $outputFile).Length
$sizeMB = [math]::Round($size / 1MB, 2)

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Green
Write-Host "Output: $outputFile"
Write-Host "Size: $sizeMB MB"
Write-Host "SHA256: $hash"

# Save hash to file
$hash | Out-File -FilePath (Join-Path $OutputDir "$ProjectName.sha256") -NoNewline

Write-Host ""
Write-Host "To install as service:" -ForegroundColor Yellow
Write-Host "  .\$outputFile -install"
Write-Host ""
Write-Host "To run in console mode:" -ForegroundColor Yellow
Write-Host "  .\$outputFile"
