package main

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Policy represents the blocking policy
type Policy struct {
	Version   string   `json:"version"`
	Blocked   []string `json:"blocked"`
	UpdatedAt string   `json:"updated_at"`
}

// PolicyEngine manages domain blocking policies
type PolicyEngine struct {
	mu         sync.RWMutex
	policy     *Policy
	policyPath string
	watcher    *fsnotify.Watcher
	stopChan   chan struct{}
}

// NewPolicyEngine creates a new policy engine
func NewPolicyEngine(policyPath string) (*PolicyEngine, error) {
	pe := &PolicyEngine{
		policyPath: policyPath,
		stopChan:   make(chan struct{}),
	}

	// Initial load
	if err := pe.reload(); err != nil {
		// If file doesn't exist, start with empty policy
		pe.policy = &Policy{
			Version:   "1.0.0",
			Blocked:   []string{},
			UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		}
	}

	// Setup file watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return pe, nil // Continue without watcher
	}
	pe.watcher = watcher

	go pe.watchPolicy()

	// Add path to watcher
	if err := watcher.Add(policyPath); err != nil {
		// Try watching the directory instead
		dir := strings.TrimSuffix(policyPath, "/"+strings.Split(policyPath, "/")[len(strings.Split(policyPath, "/"))-1])
		watcher.Add(dir)
	}

	return pe, nil
}

// reload loads policy from file
func (pe *PolicyEngine) reload() error {
	data, err := os.ReadFile(pe.policyPath)
	if err != nil {
		return err
	}

	var policy Policy
	if err := json.Unmarshal(data, &policy); err != nil {
		return err
	}

	pe.mu.Lock()
	pe.policy = &policy
	pe.mu.Unlock()

	return nil
}

// watchPolicy watches for policy file changes
func (pe *PolicyEngine) watchPolicy() {
	if pe.watcher == nil {
		return
	}

	for {
		select {
		case event, ok := <-pe.watcher.Events:
			if !ok {
				return
			}
			if event.Op&(fsnotify.Write|fsnotify.Create) != 0 {
				if strings.Contains(event.Name, "blocked_websites") {
					time.Sleep(100 * time.Millisecond) // Debounce
					pe.reload()
				}
			}
		case <-pe.watcher.Errors:
			// Ignore errors, continue watching
		case <-pe.stopChan:
			return
		}
	}
}

// IsBlocked checks if a domain should be blocked
// Implements CORRECT suffix matching to avoid false positives
func (pe *PolicyEngine) IsBlocked(domain string) (bool, string) {
	pe.mu.RLock()
	defer pe.mu.RUnlock()

	if pe.policy == nil {
		return false, ""
	}

	// Normalize query domain
	domain = normalizeDomain(domain)

	for _, pattern := range pe.policy.Blocked {
		pattern = normalizeDomain(pattern)

		if domainMatches(domain, pattern) {
			return true, pattern
		}
	}

	return false, ""
}

// normalizeDomain normalizes a domain for comparison
func normalizeDomain(domain string) string {
	domain = strings.TrimSuffix(domain, ".")
	domain = strings.ToLower(domain)
	return domain
}

// domainMatches implements CORRECT domain matching
// This avoids false positives like "evilfacebook.com" matching "facebook.com"
func domainMatches(domain, pattern string) bool {
	// Handle wildcard patterns: *.tiktok.com
	if strings.HasPrefix(pattern, "*.") {
		baseDomain := pattern[2:] // tiktok.com

		// Exact match with base domain
		if domain == baseDomain {
			return true
		}

		// Subdomain match: api.tiktok.com ends with .tiktok.com
		if strings.HasSuffix(domain, "."+baseDomain) {
			return true
		}

		return false
	}

	// Exact match
	if domain == pattern {
		return true
	}

	// Subdomain match: www.facebook.com matches facebook.com policy
	// BUT evilfacebook.com does NOT match facebook.com
	if strings.HasSuffix(domain, "."+pattern) {
		return true
	}

	return false
}

// Stop stops the policy engine
func (pe *PolicyEngine) Stop() {
	close(pe.stopChan)
	if pe.watcher != nil {
		pe.watcher.Close()
	}
}

// GetPolicy returns current policy (for debugging)
func (pe *PolicyEngine) GetPolicy() *Policy {
	pe.mu.RLock()
	defer pe.mu.RUnlock()
	return pe.policy
}
