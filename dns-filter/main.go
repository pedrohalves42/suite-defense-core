//go:build windows
// +build windows

package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/windows/svc"
)

const serviceName = "CyberShield-DNS"
const serviceDesc = "CyberShield DNS Filter - Local DNS filtering for security policy enforcement"

var (
	version    = "1.0.0"
	configPath string
	runAsService bool
)

func main() {
	// Parse command line flags
	flag.StringVar(&configPath, "config", "", "Path to configuration file")
	flag.BoolVar(&runAsService, "service", false, "Run as Windows service")
	installCmd := flag.Bool("install", false, "Install as Windows service")
	uninstallCmd := flag.Bool("uninstall", false, "Uninstall Windows service")
	versionCmd := flag.Bool("version", false, "Print version")
	flag.Parse()

	if *versionCmd {
		fmt.Printf("CyberShield DNS Filter v%s\n", version)
		os.Exit(0)
	}

	if *installCmd {
		if err := installService(); err != nil {
			log.Fatalf("Failed to install service: %v", err)
		}
		fmt.Println("Service installed successfully")
		os.Exit(0)
	}

	if *uninstallCmd {
		if err := uninstallService(); err != nil {
			log.Fatalf("Failed to uninstall service: %v", err)
		}
		fmt.Println("Service uninstalled successfully")
		os.Exit(0)
	}

	// Check if running as Windows service
	isService, err := svc.IsWindowsService()
	if err != nil {
		log.Fatalf("Failed to detect service mode: %v", err)
	}

	if isService || runAsService {
		runService()
	} else {
		runInteractive()
	}
}

// runInteractive runs the DNS filter in interactive/console mode
func runInteractive() {
	log.Printf("CyberShield DNS Filter v%s starting in interactive mode...", version)

	// Setup logging to file
	logFile := setupLogging()
	if logFile != nil {
		defer logFile.Close()
	}

	// Load configuration
	config, err := LoadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Create policy engine
	policy, err := NewPolicyEngine(config.PolicyPath)
	if err != nil {
		log.Fatalf("Failed to create policy engine: %v", err)
	}
	defer policy.Stop()

	// Create event logger
	eventLogger, err := NewEventLogger(config.LogPath)
	if err != nil {
		log.Printf("Warning: Failed to create event logger: %v", err)
	}
	if eventLogger != nil {
		defer eventLogger.Close()
	}

	// Create and start DNS server
	server := NewDNSServer(config, policy, eventLogger)
	if err := server.Start(); err != nil {
		log.Fatalf("Failed to start DNS server: %v", err)
	}
	defer server.Stop()

	log.Printf("DNS Filter running on %s", config.ListenAddr)
	log.Printf("Upstream DNS: %s (fallback: %s)", config.UpstreamDNS, config.FallbackDNS)
	log.Printf("Policy path: %s", config.PolicyPath)
	log.Printf("Event log: %s", config.LogPath)

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
}

// setupLogging configures logging to file
func setupLogging() *os.File {
	logDir := filepath.Join(os.Getenv("ProgramData"), "CyberShield", "logs")
	os.MkdirAll(logDir, 0755)

	logPath := filepath.Join(logDir, "dns-filter.log")
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil
	}

	log.SetOutput(f)
	return f
}

// Windows Service implementation
type dnsFilterService struct {
	server *DNSServer
	policy *PolicyEngine
	logger *EventLogger
}

func (s *dnsFilterService) Execute(args []string, r <-chan svc.ChangeRequest, changes chan<- svc.Status) (ssec bool, errno uint32) {
	const cmdsAccepted = svc.AcceptStop | svc.AcceptShutdown

	changes <- svc.Status{State: svc.StartPending}

	// Load configuration
	config, err := LoadConfig(configPath)
	if err != nil {
		log.Printf("Failed to load config: %v", err)
		return
	}

	// Create policy engine
	s.policy, err = NewPolicyEngine(config.PolicyPath)
	if err != nil {
		log.Printf("Failed to create policy engine: %v", err)
		return
	}

	// Create event logger
	s.logger, err = NewEventLogger(config.LogPath)
	if err != nil {
		log.Printf("Warning: Failed to create event logger: %v", err)
	}

	// Create and start DNS server
	s.server = NewDNSServer(config, s.policy, s.logger)
	if err := s.server.Start(); err != nil {
		log.Printf("Failed to start DNS server: %v", err)
		return
	}

	log.Printf("CyberShield DNS Filter v%s started as service", version)
	changes <- svc.Status{State: svc.Running, Accepts: cmdsAccepted}

	// Service loop
loop:
	for {
		select {
		case c := <-r:
			switch c.Cmd {
			case svc.Interrogate:
				changes <- c.CurrentStatus
			case svc.Stop, svc.Shutdown:
				break loop
			}
		}
	}

	changes <- svc.Status{State: svc.StopPending}

	// Cleanup
	if s.server != nil {
		s.server.Stop()
	}
	if s.policy != nil {
		s.policy.Stop()
	}
	if s.logger != nil {
		s.logger.Close()
	}

	log.Println("Service stopped")
	return
}

func runService() {
	setupLogging()
	log.Printf("Starting CyberShield DNS Filter as Windows service...")

	err := svc.Run(serviceName, &dnsFilterService{})
	if err != nil {
		log.Fatalf("Service failed: %v", err)
	}
}
