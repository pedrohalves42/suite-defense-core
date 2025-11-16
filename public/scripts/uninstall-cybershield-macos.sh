#!/bin/bash
# CyberShield Agent Uninstaller - macOS
# Version: 1.0.0

set -euo pipefail

echo "==========================================="
echo " CyberShield Agent Uninstaller - macOS"
echo "==========================================="

# Check root privileges
if [ "$(id -u)" -ne 0 ]; then
  echo "❌ This uninstaller must be run as root."
  echo "   Usage: sudo bash uninstall-cybershield-macos.sh"
  exit 1
fi

# Paths
PLIST_PATH="/Library/LaunchDaemons/com.cybershield.agent.plist"
INSTALL_DIR="/Library/Application Support/CyberShield"
LOG_DIR="/Library/Logs/CyberShield"

echo ""
echo "⚠️  WARNING: This will completely remove CyberShield Agent from your system."
echo "   - All agent files will be deleted"
echo "   - All logs will be removed"
echo "   - The agent will no longer report to the dashboard"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Uninstallation cancelled."
  exit 0
fi

echo ""
echo "[1/5] Stopping agent service..."
if launchctl list | grep -q "com.cybershield.agent"; then
  launchctl stop com.cybershield.agent 2>/dev/null || true
  echo "✅ Agent service stopped"
else
  echo "ℹ️  Agent service not running"
fi

echo "[2/5] Unloading LaunchDaemon..."
if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "✅ LaunchDaemon unloaded and removed"
else
  echo "ℹ️  LaunchDaemon not found"
fi

echo "[3/5] Removing installation directory..."
if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo "✅ Installation directory removed"
else
  echo "ℹ️  Installation directory not found"
fi

echo "[4/5] Removing logs..."
if [ -d "$LOG_DIR" ]; then
  # Ask if user wants to keep logs for debugging
  read -p "Do you want to keep logs for debugging? (yes/no): " keep_logs
  if [ "$keep_logs" != "yes" ]; then
    rm -rf "$LOG_DIR"
    echo "✅ Logs removed"
  else
    echo "ℹ️  Logs preserved at: $LOG_DIR"
  fi
else
  echo "ℹ️  Log directory not found"
fi

echo "[5/5] Verifying removal..."
sleep 1

# Verify everything is removed
all_clean=true

if launchctl list | grep -q "com.cybershield.agent"; then
  echo "⚠️  Warning: Agent service still appears in launchctl"
  all_clean=false
fi

if [ -f "$PLIST_PATH" ]; then
  echo "⚠️  Warning: LaunchDaemon plist still exists"
  all_clean=false
fi

if [ -d "$INSTALL_DIR" ]; then
  echo "⚠️  Warning: Installation directory still exists"
  all_clean=false
fi

echo ""
if [ "$all_clean" = true ]; then
  echo "==========================================="
  echo "✅ CyberShield Agent successfully removed!"
  echo "==========================================="
  echo ""
  echo "The agent has been completely uninstalled from your system."
  echo ""
else
  echo "==========================================="
  echo "⚠️  Uninstallation completed with warnings"
  echo "==========================================="
  echo ""
  echo "Some components may still be present. Please check the warnings above."
  echo "You may need to manually remove remaining files or restart your system."
  echo ""
fi

exit 0
