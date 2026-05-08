package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizePolicyPatternsCanonicalizesAndDropsInvalidEntries(t *testing.T) {
	patterns := normalizePolicyPatterns([]string{" Example.COM. ", "example.com", "", "   ", "*."})

	if len(patterns) != 1 || patterns[0] != "example.com" {
		t.Fatalf("unexpected normalized patterns: %#v", patterns)
	}
}

func TestPolicyEngineLoadsCanonicalPolicyAndMatchesSafely(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "blocked_websites.json")
	policy := Policy{Blocked: []string{" Example.COM. ", "*.TikTok.COM.", ""}}
	data, err := json.Marshal(policy)
	if err != nil {
		t.Fatalf("marshal policy: %v", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write policy: %v", err)
	}

	engine, err := NewPolicyEngine(path)
	if err != nil {
		t.Fatalf("new policy engine: %v", err)
	}
	defer engine.Stop()

	tests := []struct {
		domain  string
		blocked bool
		pattern string
	}{
		{domain: "example.com.", blocked: true, pattern: "example.com"},
		{domain: "www.example.com", blocked: true, pattern: "example.com"},
		{domain: "evil-example.com", blocked: false},
		{domain: "api.tiktok.com", blocked: true, pattern: "*.tiktok.com"},
		{domain: "notiktok.com", blocked: false},
	}

	for _, tt := range tests {
		blocked, pattern := engine.IsBlocked(tt.domain)
		if blocked != tt.blocked || pattern != tt.pattern {
			t.Fatalf("IsBlocked(%q) = (%v, %q), want (%v, %q)", tt.domain, blocked, pattern, tt.blocked, tt.pattern)
		}
	}
}

func TestGetPolicyReturnsDefensiveCopy(t *testing.T) {
	engine := &PolicyEngine{policy: &Policy{Blocked: []string{"example.com"}}}

	copy := engine.GetPolicy()
	copy.Blocked[0] = "mutated.test"

	blocked, pattern := engine.IsBlocked("example.com")
	if !blocked || pattern != "example.com" {
		t.Fatalf("policy was mutated through GetPolicy copy: blocked=%v pattern=%q", blocked, pattern)
	}
}

func TestPolicyEngineStopIsIdempotent(t *testing.T) {
	engine := &PolicyEngine{stopChan: make(chan struct{})}

	engine.Stop()
	engine.Stop()
}
