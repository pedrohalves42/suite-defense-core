# CyberShield Agent - macOS Corporate Proxy Support

## Overview

This guide explains how to configure the CyberShield Agent to work through corporate proxies on macOS.

## Automatic Proxy Detection

The macOS agent automatically detects system proxy settings using `scutil --proxy`:

```bash
# Check current proxy configuration
scutil --proxy

# Example output:
# <dictionary> {
#   HTTPEnable : 1
#   HTTPPort : 8080
#   HTTPProxy : proxy.company.com
#   HTTPSEnable : 1
#   HTTPSPort : 8080
#   HTTPSProxy : proxy.company.com
# }
```

## Manual Proxy Configuration

### Method 1: Environment Variables (Recommended)

Edit the LaunchDaemon plist to include proxy environment variables:

```bash
sudo nano /Library/LaunchDaemons/com.cybershield.agent.plist
```

Add these keys:

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>http_proxy</key>
    <string>http://proxy.company.com:8080</string>
    <key>https_proxy</key>
    <string>http://proxy.company.com:8080</string>
    <key>no_proxy</key>
    <string>localhost,127.0.0.1,.local</string>
</dict>
```

Reload the service:
```bash
sudo launchctl unload /Library/LaunchDaemons/com.cybershield.agent.plist
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist
```

### Method 2: Proxy with Authentication

For proxies requiring authentication, use:

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>http_proxy</key>
    <string>http://username:password@proxy.company.com:8080</string>
    <key>https_proxy</key>
    <string>http://username:password@proxy.company.com:8080</string>
</dict>
```

⚠️ **Security Warning**: Storing credentials in plain text is not recommended. Use certificate-based authentication or proxy PAC files when possible.

## Testing Proxy Configuration

```bash
# Test HTTPS connectivity through proxy
export https_proxy="http://proxy.company.com:8080"
curl -v https://your-cybershield-server.com/functions/v1/agent-health-check

# Should see:
# * Trying proxy.company.com:8080...
# * Connected to proxy.company.com (xxx.xxx.xxx.xxx) port 8080 (#0)
```

## Troubleshooting

### Agent Not Connecting

1. **Check proxy logs**:
   ```bash
   tail -f /Library/Logs/CyberShield/agent.log
   ```

2. **Verify proxy is reachable**:
   ```bash
   nc -zv proxy.company.com 8080
   ```

3. **Test with curl**:
   ```bash
   curl -x http://proxy.company.com:8080 https://your-server.com/functions/v1/agent-health-check
   ```

### Certificate Issues with SSL Inspection

If your proxy performs SSL inspection:

```bash
# Add corporate root CA to system trust
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /path/to/corporate-root-ca.crt

# Verify
security find-certificate -a -c "Corporate Root CA" /Library/Keychains/System.keychain
```

## MDM Deployment with Proxy

For centralized deployment via Jamf/Intune, create a configuration profile:

### Jamf Pro Configuration Profile

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.proxy.http.global</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.cybershield.proxy</string>
            <key>ProxyServer</key>
            <string>proxy.company.com</string>
            <key>ProxyServerPort</key>
            <integer>8080</integer>
        </dict>
    </array>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
```

---

**Last Updated**: 2025-01-16  
**Version**: 1.0.0
