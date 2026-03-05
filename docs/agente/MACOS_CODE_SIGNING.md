# CyberShield Agent - macOS Code Signing & Notarization Guide

## Overview

For production distribution of the CyberShield Agent on macOS, especially in corporate environments, you need to:

1. **Sign the installer script** with an Apple Developer ID
2. **Notarize the package** with Apple
3. **Distribute via MDM** or direct download

This prevents Gatekeeper warnings and ensures smooth deployment.

---

## Prerequisites

### 1. Apple Developer Account

- Enroll in **Apple Developer Program** ($99/year)
- URL: https://developer.apple.com/programs/

### 2. Developer ID Certificate

1. Log in to [Apple Developer Portal](https://developer.apple.com/account/)
2. Go to **Certificates, Identifiers & Profiles**
3. Create a new certificate:
   - Type: **Developer ID Application**
   - Follow the Certificate Signing Request (CSR) process
4. Download and install the certificate in **Keychain Access**

### 3. Required Tools

```bash
# Verify Xcode Command Line Tools are installed
xcode-select --install

# Verify your certificates
security find-identity -v -p codesigning
```

You should see output like:
```
1) ABC123... "Developer ID Application: Your Company Name (TEAM_ID)"
```

---

## Code Signing Workflow

### Step 1: Sign the Installer Script

Even though shell scripts don't require signing like binaries, you can create a signed `.pkg` for distribution:

```bash
# Build the package
pkgbuild \
  --root ./pkg-root \
  --identifier com.cybershield.agent \
  --version 1.0.0 \
  --scripts ./pkg-scripts \
  --install-location /Library/Application\ Support/CyberShield \
  CyberShield-Agent-unsigned.pkg

# Sign the package
productsign \
  --sign "Developer ID Installer: Your Company Name (TEAM_ID)" \
  CyberShield-Agent-unsigned.pkg \
  CyberShield-Agent-signed.pkg

# Verify signature
pkgutil --check-signature CyberShield-Agent-signed.pkg
```

### Step 2: Notarize the Package

Notarization is required for macOS 10.15+ (Catalina and later).

#### 2.1: Create an App-Specific Password

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in
3. Go to **Security** → **App-Specific Passwords**
4. Generate a new password (save it securely)

#### 2.2: Store Credentials in Keychain

```bash
xcrun notarytool store-credentials "cybershield-notary-profile" \
  --apple-id "your-apple-id@company.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "xxxx-xxxx-xxxx-xxxx"
```

#### 2.3: Submit for Notarization

```bash
# Submit the signed package
xcrun notarytool submit CyberShield-Agent-signed.pkg \
  --keychain-profile "cybershield-notary-profile" \
  --wait

# If successful, you'll see:
# "status: Accepted"
```

#### 2.4: Staple the Notarization Ticket

```bash
# Attach the notarization ticket to the package
xcrun stapler staple CyberShield-Agent-signed.pkg

# Verify stapling
xcrun stapler validate CyberShield-Agent-signed.pkg
```

---

## Automated Signing Script

Create `scripts/sign-and-notarize-macos.sh`:

```bash
#!/bin/bash
set -euo pipefail

PACKAGE_NAME="CyberShield-Agent"
VERSION="1.0.0"
DEVELOPER_ID="Developer ID Installer: Your Company Name (TEAM_ID)"
NOTARY_PROFILE="cybershield-notary-profile"

echo "🔐 Building and signing $PACKAGE_NAME v$VERSION..."

# 1. Build unsigned package
pkgbuild \
  --root ./pkg-root \
  --identifier com.cybershield.agent \
  --version "$VERSION" \
  --scripts ./pkg-scripts \
  --install-location /Library/Application\ Support/CyberShield \
  "${PACKAGE_NAME}-unsigned.pkg"

# 2. Sign the package
productsign \
  --sign "$DEVELOPER_ID" \
  "${PACKAGE_NAME}-unsigned.pkg" \
  "${PACKAGE_NAME}-signed.pkg"

echo "✅ Package signed"

# 3. Submit for notarization
echo "📤 Submitting for notarization (this may take a few minutes)..."
xcrun notarytool submit "${PACKAGE_NAME}-signed.pkg" \
  --keychain-profile "$NOTARY_PROFILE" \
  --wait

# 4. Staple the ticket
echo "📎 Stapling notarization ticket..."
xcrun stapler staple "${PACKAGE_NAME}-signed.pkg"

# 5. Verify
echo "🔍 Verifying signature and notarization..."
pkgutil --check-signature "${PACKAGE_NAME}-signed.pkg"
xcrun stapler validate "${PACKAGE_NAME}-signed.pkg"

echo ""
echo "✅ $PACKAGE_NAME v$VERSION is ready for distribution!"
echo "   File: ${PACKAGE_NAME}-signed.pkg"

# Cleanup
rm -f "${PACKAGE_NAME}-unsigned.pkg"
```

Make it executable:
```bash
chmod +x scripts/sign-and-notarize-macos.sh
```

---

## Package Structure for `.pkg`

For MDM distribution, create a proper `.pkg` structure:

```
cybershield-pkg/
├── pkg-root/
│   └── cybershield-agent-macos.sh
├── pkg-scripts/
│   ├── postinstall
│   └── preinstall (optional)
└── build-pkg.sh
```

### `pkg-scripts/postinstall`

```bash
#!/bin/bash
# Post-installation script

INSTALL_DIR="/Library/Application Support/CyberShield"
LOG_DIR="/Library/Logs/CyberShield"
PLIST_PATH="/Library/LaunchDaemons/com.cybershield.agent.plist"

# Create directories
mkdir -p "$LOG_DIR"

# Create LaunchDaemon plist
cat > "$PLIST_PATH" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" \
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
      <string>/Library/Application Support/CyberShield/cybershield-agent-macos.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Library/Logs/CyberShield/agent.log</string>
    <key>StandardErrorPath</key>
    <string>/Library/Logs/CyberShield/agent-error.log</string>
  </dict>
</plist>
EOF

chmod 644 "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"

# Load and start the agent
launchctl load "$PLIST_PATH"
launchctl start com.cybershield.agent

exit 0
```

Make scripts executable:
```bash
chmod +x pkg-scripts/postinstall
```

---

## MDM Deployment

### Jamf Pro

1. Upload `CyberShield-Agent-signed.pkg` to Jamf
2. Create a **Policy**:
   - Name: "Install CyberShield Agent"
   - Package: CyberShield-Agent-signed.pkg
   - Trigger: Enrollment Complete or Check-in
3. Scope to target computers

### Microsoft Intune

1. Go to **Apps** → **macOS** → **Add**
2. App type: **Line-of-business app**
3. Upload `CyberShield-Agent-signed.pkg`
4. Configure deployment settings
5. Assign to target groups

### Kandji

1. Go to **Library** → **Custom Apps**
2. Upload `CyberShield-Agent-signed.pkg`
3. Set deployment rules
4. Assign to blueprints

---

## Troubleshooting

### "Developer ID not found"

```bash
# List all signing identities
security find-identity -v -p codesigning

# Import certificate if needed
security import YourCertificate.p12 -k ~/Library/Keychains/login.keychain
```

### "Notarization failed"

```bash
# Check notarization log
xcrun notarytool log <submission-id> \
  --keychain-profile "cybershield-notary-profile"
```

Common issues:
- Unsigned binaries in package
- Missing entitlements
- Hardened runtime not enabled (for binaries)

### "Package validation failed"

```bash
# Validate package structure
pkgutil --expand CyberShield-Agent-signed.pkg /tmp/pkg-check
ls -la /tmp/pkg-check
```

---

## Best Practices

1. **Automate signing in CI/CD**: Store certificates securely (e.g., GitHub Secrets, AWS Secrets Manager)
2. **Version your packages**: Include version in filename (`CyberShield-Agent-1.0.0.pkg`)
3. **Test on clean systems**: Always test signed packages on fresh macOS installations
4. **Monitor notarization**: Apple may reject packages that violate policies
5. **Keep certificates updated**: Developer ID certificates expire after 5 years

---

## Security Considerations

- **Never commit certificates** to version control
- **Rotate App-Specific Passwords** regularly
- **Audit package contents** before signing
- **Use separate signing identities** for development vs production
- **Log all signing operations** for compliance

---

## CI/CD Integration Example (GitHub Actions)

```yaml
name: Sign and Notarize macOS Agent

on:
  release:
    types: [published]

jobs:
  sign-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Import certificates
        env:
          CERTIFICATE_BASE64: ${{ secrets.MACOS_CERTIFICATE }}
          CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
        run: |
          echo "$CERTIFICATE_BASE64" | base64 --decode > certificate.p12
          security create-keychain -p temp-password build.keychain
          security import certificate.p12 -k build.keychain -P "$CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security list-keychains -s build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p temp-password build.keychain
      
      - name: Build and sign package
        run: ./scripts/sign-and-notarize-macos.sh
        env:
          NOTARY_APPLE_ID: ${{ secrets.NOTARY_APPLE_ID }}
          NOTARY_PASSWORD: ${{ secrets.NOTARY_PASSWORD }}
          NOTARY_TEAM_ID: ${{ secrets.NOTARY_TEAM_ID }}
      
      - name: Upload signed package
        uses: actions/upload-artifact@v3
        with:
          name: cybershield-agent-macos-signed
          path: CyberShield-Agent-signed.pkg
```

---

## Additional Resources

- [Apple Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Introduction/Introduction.html)
- [Distributing macOS Apps](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)

---

**Last Updated**: 2025-01-16  
**Version**: 1.0.0
