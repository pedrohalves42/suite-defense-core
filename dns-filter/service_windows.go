//go:build windows
// +build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/svc/eventlog"
	"golang.org/x/sys/windows/svc/mgr"
)

// installService installs the DNS filter as a Windows service
func installService() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %w", err)
	}
	defer m.Disconnect()

	// Check if service already exists
	s, err := m.OpenService(serviceName)
	if err == nil {
		s.Close()
		return fmt.Errorf("service %s already exists", serviceName)
	}

	// Create config path argument
	configPath := filepath.Join(os.Getenv("ProgramData"), "CyberShield", "dns-config.json")

	// Create service
	s, err = m.CreateService(serviceName, exePath, mgr.Config{
		DisplayName:      "CyberShield DNS Filter",
		Description:      serviceDesc,
		StartType:        mgr.StartAutomatic,
		ServiceStartName: "LocalSystem",
	}, "-service", "-config", configPath)
	if err != nil {
		return fmt.Errorf("failed to create service: %w", err)
	}
	defer s.Close()

	// Configure recovery actions (restart on failure)
	recoveryActions := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 5000},  // Restart after 5 seconds
		{Type: mgr.ServiceRestart, Delay: 10000}, // Restart after 10 seconds
		{Type: mgr.ServiceRestart, Delay: 30000}, // Restart after 30 seconds
	}
	err = s.SetRecoveryActions(recoveryActions, 86400) // Reset counter after 24 hours
	if err != nil {
		// Non-fatal, just log
		fmt.Printf("Warning: Could not set recovery actions: %v\n", err)
	}

	// Install event log source
	err = eventlog.InstallAsEventCreate(serviceName, eventlog.Error|eventlog.Warning|eventlog.Info)
	if err != nil {
		// Non-fatal
		fmt.Printf("Warning: Could not install event log: %v\n", err)
	}

	return nil
}

// uninstallService removes the Windows service
func uninstallService() error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect to service manager: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(serviceName)
	if err != nil {
		return fmt.Errorf("service %s is not installed", serviceName)
	}
	defer s.Close()

	// Stop service if running
	s.Control(mgr.Stop)

	// Delete service
	err = s.Delete()
	if err != nil {
		return fmt.Errorf("failed to delete service: %w", err)
	}

	// Remove event log
	eventlog.Remove(serviceName)

	return nil
}
