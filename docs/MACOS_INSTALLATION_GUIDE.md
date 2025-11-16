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
- Corporate proxy: Set `http_proxy` and `https_proxy` environment variables
- Firewall: Allow outbound HTTPS (443) to CyberShield server
