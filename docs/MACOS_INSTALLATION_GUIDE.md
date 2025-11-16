# CyberShield Agent - macOS Installation Guide

## System Requirements

- macOS 10.15 (Catalina) or later
- Bash 3.2+
- Administrator (sudo) privileges
- Internet connectivity

## Installation Methods

### Method 1: One-Line Install (Recommended)

1. Go to **Agent Installer** in the CyberShield dashboard
2. Enter agent name and select **macOS** platform
3. Copy the generated command
4. Open Terminal and run:
   ```bash
   curl -sL "https://your-server.com/..." | sudo bash
   ```

### Method 2: Manual Download

1. Download the installer:
   ```bash
   curl -sSL "https://your-server.com/..." -o install-macos.sh
   chmod +x install-macos.sh
   ```

2. Run with sudo:
   ```bash
   sudo ./install-macos.sh
   ```

## Post-Installation

### Verify Agent Status
```bash
launchctl list | grep cybershield
```

### View Logs
```bash
tail -f /Library/Logs/CyberShield/agent.log
```

### Stop Agent
```bash
sudo launchctl stop com.cybershield.agent
```

### Start Agent
```bash
sudo launchctl start com.cybershield.agent
```

## Uninstallation

```bash
sudo launchctl unload /Library/LaunchDaemons/com.cybershield.agent.plist
sudo rm -rf /Library/Application\ Support/CyberShield
sudo rm /Library/LaunchDaemons/com.cybershield.agent.plist
sudo rm -rf /Library/Logs/CyberShield
```

## Troubleshooting

### Agent Not Starting
1. Check plist syntax: `plutil -lint /Library/LaunchDaemons/com.cybershield.agent.plist`
2. Check error logs: `tail /Library/Logs/CyberShield/agent-error.log`
3. Verify connectivity: `curl -I https://your-server.com/functions/v1/agent-health-check`

### Permission Denied
- Ensure you're using `sudo` for installation
- Check file permissions: `ls -la /Library/Application\ Support/CyberShield`

### Network Issues
- Corporate proxy: Set `http_proxy` and `https_proxy` environment variables (see [Proxy Support Guide](MACOS_PROXY_SUPPORT.md))
- Firewall: Allow outbound HTTPS (443) to CyberShield server
- Test connectivity: `curl -v https://your-server.com/functions/v1/agent-health-check`

### LaunchDaemon Not Loading
```bash
# Check for errors
sudo launchctl load -w /Library/LaunchDaemons/com.cybershield.agent.plist

# View system log
log show --predicate 'process == "com.cybershield.agent"' --last 5m
```

## Advanced Configuration

### Corporate Proxy Support

See [macOS Proxy Support Guide](MACOS_PROXY_SUPPORT.md) for detailed instructions on:
- Automatic proxy detection
- Manual proxy configuration
- Proxy authentication
- SSL inspection handling

### Custom Poll Interval

Edit the LaunchDaemon to change the heartbeat interval:

```bash
sudo nano /Library/LaunchDaemons/com.cybershield.agent.plist
```

Change the last argument (default: 60 seconds):
```xml
<string>60</string>  <!-- Change to desired interval -->
```

## Security Considerations

- The agent runs with root privileges to access system information
- All communication uses HTTPS with HMAC-SHA256 authentication
- Credentials are stored in the LaunchDaemon plist (protected by file permissions)
- Logs contain no sensitive information (tokens are masked)

## Logs and Diagnostics

### Log Files
- **Main log**: `/Library/Logs/CyberShield/agent.log`
- **Error log**: `/Library/Logs/CyberShield/agent-error.log`

### Log Rotation
Logs automatically rotate when they reach 10MB, keeping the last 7 files.

### Viewing Logs
```bash
# Live tail
tail -f /Library/Logs/CyberShield/agent.log

# Last 50 lines
tail -50 /Library/Logs/CyberShield/agent.log

# Search for errors
grep ERROR /Library/Logs/CyberShield/agent.log
```

## Compatibility

| macOS Version | Status | Notes |
|---------------|--------|-------|
| 15.x Sonoma | ✅ Tested | Full support |
| 14.x Ventura | ✅ Tested | Full support |
| 13.x Monterey | ✅ Tested | Full support |
| 12.x Big Sur | ✅ Compatible | Not extensively tested |
| 11.x Catalina | ✅ Compatible | Minimum supported version |
| 10.x Mojave and earlier | ❌ Not supported | Security requirements |

### Apple Silicon vs Intel

The agent works on both Apple Silicon (M1/M2/M3) and Intel Macs without modification.

## Production Deployment

For enterprise deployments:

1. **Code Sign & Notarize**: See [Code Signing Guide](MACOS_CODE_SIGNING.md)
2. **MDM Distribution**: Deploy via Jamf Pro, Intune, or Kandji
3. **Configuration Profiles**: Standardize proxy and settings
4. **Monitoring**: Track agent health via CyberShield dashboard

## Support

For issues or questions:
- Check the [Troubleshooting Guide](../TROUBLESHOOTING_GUIDE.md)
- Review system logs and agent diagnostics
- Contact support: support@cybershield.com
