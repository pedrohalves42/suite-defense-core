package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config holds the DNS filter configuration
type Config struct {
	ListenAddr     string `json:"listen_addr"`
	UpstreamDNS    string `json:"upstream_dns"`
	FallbackDNS    string `json:"fallback_dns"`
	PolicyPath     string `json:"policy_path"`
	LogPath        string `json:"log_path"`
	HealthInterval int    `json:"health_interval_seconds"`
	QueryTimeout   int    `json:"query_timeout_ms"`
	BlockTTL       int    `json:"block_ttl_seconds"`
}

// DefaultConfig returns the default configuration
func DefaultConfig() *Config {
	return &Config{
		ListenAddr:     "127.0.0.1:53",
		UpstreamDNS:    "1.1.1.1:53",
		FallbackDNS:    "8.8.8.8:53",
		PolicyPath:     filepath.Join(os.Getenv("ProgramData"), "CyberShield", "blocked_websites.json"),
		LogPath:        filepath.Join(os.Getenv("ProgramData"), "CyberShield", "dns_blocked_events.log"),
		HealthInterval: 30,
		QueryTimeout:   3000,
		BlockTTL:       60,
	}
}

// LoadConfig loads configuration from a JSON file
func LoadConfig(path string) (*Config, error) {
	cfg := DefaultConfig()

	if path == "" {
		return cfg, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Save saves configuration to a JSON file
func (c *Config) Save(path string) error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}
