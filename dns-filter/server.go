package main

import (
	"log"
	"net"
	"sync"
	"time"

	"github.com/miekg/dns"
)

// DNSServer represents the DNS filter server
type DNSServer struct {
	config       *Config
	policy       *PolicyEngine
	logger       *EventLogger
	udpServer    *dns.Server
	tcpServer    *dns.Server
	upstream     string
	fallback     string
	passthrough  bool
	mu           sync.RWMutex
	stopChan     chan struct{}
	client       *dns.Client
	clientTCP    *dns.Client
}

// NewDNSServer creates a new DNS server
func NewDNSServer(config *Config, policy *PolicyEngine, logger *EventLogger) *DNSServer {
	return &DNSServer{
		config:   config,
		policy:   policy,
		logger:   logger,
		upstream: config.UpstreamDNS,
		fallback: config.FallbackDNS,
		stopChan: make(chan struct{}),
		client: &dns.Client{
			Net:     "udp",
			Timeout: time.Duration(config.QueryTimeout) * time.Millisecond,
		},
		clientTCP: &dns.Client{
			Net:     "tcp",
			Timeout: time.Duration(config.QueryTimeout) * time.Millisecond,
		},
	}
}

// Start starts the DNS server
func (s *DNSServer) Start() error {
	// Setup handler
	dns.HandleFunc(".", s.handleRequest)

	// UDP server
	s.udpServer = &dns.Server{
		Addr: s.config.ListenAddr,
		Net:  "udp",
	}

	// TCP server
	s.tcpServer = &dns.Server{
		Addr: s.config.ListenAddr,
		Net:  "tcp",
	}

	// Start healthcheck
	go s.healthcheck()

	// Start servers
	errChan := make(chan error, 2)

	go func() {
		log.Printf("[DNS] Starting UDP server on %s", s.config.ListenAddr)
		if err := s.udpServer.ListenAndServe(); err != nil {
			errChan <- err
		}
	}()

	go func() {
		log.Printf("[DNS] Starting TCP server on %s", s.config.ListenAddr)
		if err := s.tcpServer.ListenAndServe(); err != nil {
			errChan <- err
		}
	}()

	// Wait a bit to check for immediate errors
	select {
	case err := <-errChan:
		return err
	case <-time.After(100 * time.Millisecond):
		return nil
	}
}

// Stop stops the DNS server
func (s *DNSServer) Stop() {
	close(s.stopChan)
	if s.udpServer != nil {
		s.udpServer.Shutdown()
	}
	if s.tcpServer != nil {
		s.tcpServer.Shutdown()
	}
}

// handleRequest handles incoming DNS requests
func (s *DNSServer) handleRequest(w dns.ResponseWriter, r *dns.Msg) {
	m := new(dns.Msg)
	m.SetReply(r)
	m.Authoritative = false
	m.RecursionAvailable = true

	// Check if in passthrough mode (upstream unreachable)
	s.mu.RLock()
	passthrough := s.passthrough
	s.mu.RUnlock()

	for _, q := range r.Question {
		domain := q.Name
		qtype := dns.TypeToString[q.Qtype]

		// Only apply policy to A, AAAA, and HTTPS records
		// This prevents DoH bypass via HTTPS/SVCB records
		shouldFilter := q.Qtype == dns.TypeA || 
			q.Qtype == dns.TypeAAAA || 
			q.Qtype == dns.TypeHTTPS

		if !passthrough && shouldFilter {
			blocked, pattern := s.policy.IsBlocked(domain)
			if blocked {
				log.Printf("[DNS] BLOCKED: %s (%s) - pattern: %s", domain, qtype, pattern)

				// Log the event
				if s.logger != nil {
					s.logger.LogBlocked(domain, qtype, pattern)
				}

				// Respond with NXDOMAIN
				m.Rcode = dns.RcodeNameError
				m.Ns = []dns.RR{s.createSOA(domain)}

				w.WriteMsg(m)
				return
			}
		}

		// Forward to upstream
		response := s.forwardQuery(r)
		if response != nil {
			w.WriteMsg(response)
			return
		}
	}

	// If we get here, something went wrong - return SERVFAIL
	m.Rcode = dns.RcodeServerFailure
	w.WriteMsg(m)
}

// forwardQuery forwards a DNS query to upstream
func (s *DNSServer) forwardQuery(r *dns.Msg) *dns.Msg {
	// Try primary upstream
	response, _, err := s.client.Exchange(r, s.upstream)
	if err == nil {
		return response
	}

	// Try TCP if UDP failed (for large responses)
	response, _, err = s.clientTCP.Exchange(r, s.upstream)
	if err == nil {
		return response
	}

	// Try fallback DNS
	response, _, err = s.client.Exchange(r, s.fallback)
	if err == nil {
		return response
	}

	log.Printf("[DNS] Failed to forward query: %v", err)
	return nil
}

// createSOA creates a minimal SOA record for NXDOMAIN responses
func (s *DNSServer) createSOA(domain string) dns.RR {
	soa := &dns.SOA{
		Hdr: dns.RR_Header{
			Name:   domain,
			Rrtype: dns.TypeSOA,
			Class:  dns.ClassINET,
			Ttl:    uint32(s.config.BlockTTL),
		},
		Ns:      "ns.cybershield.local.",
		Mbox:    "admin.cybershield.local.",
		Serial:  uint32(time.Now().Unix()),
		Refresh: 3600,
		Retry:   600,
		Expire:  86400,
		Minttl:  uint32(s.config.BlockTTL),
	}
	return soa
}

// healthcheck periodically checks upstream DNS availability
func (s *DNSServer) healthcheck() {
	ticker := time.NewTicker(time.Duration(s.config.HealthInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Test upstream DNS
			m := new(dns.Msg)
			m.SetQuestion("dns.google.", dns.TypeA)

			_, _, err := s.client.Exchange(m, s.upstream)
			
			s.mu.Lock()
			if err != nil {
				if !s.passthrough {
					log.Printf("[DNS] Upstream unreachable, entering passthrough mode")
				}
				s.passthrough = true
			} else {
				if s.passthrough {
					log.Printf("[DNS] Upstream recovered, exiting passthrough mode")
				}
				s.passthrough = false
			}
			s.mu.Unlock()

		case <-s.stopChan:
			return
		}
	}
}

// IsPassthrough returns current passthrough state
func (s *DNSServer) IsPassthrough() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.passthrough
}

// GetStats returns server statistics
func (s *DNSServer) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"listen_addr": s.config.ListenAddr,
		"upstream":    s.upstream,
		"fallback":    s.fallback,
		"passthrough": s.IsPassthrough(),
	}
}
