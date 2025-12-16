package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// BlockedEvent represents a DNS block event
type BlockedEvent struct {
	Timestamp string `json:"ts"`
	Domain    string `json:"domain"`
	QueryType string `json:"query_type"`
	Pattern   string `json:"pattern"`
	Action    string `json:"action"`
	Source    string `json:"source"`
}

// EventLogger handles logging of blocked DNS events
type EventLogger struct {
	mu      sync.Mutex
	logPath string
	file    *os.File
}

// NewEventLogger creates a new event logger
func NewEventLogger(logPath string) (*EventLogger, error) {
	// Ensure directory exists
	dir := filepath.Dir(logPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Open file in append mode
	file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}

	return &EventLogger{
		logPath: logPath,
		file:    file,
	}, nil
}

// LogBlocked logs a blocked DNS query event
func (l *EventLogger) LogBlocked(domain, queryType, pattern string) error {
	event := BlockedEvent{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Domain:    domain,
		QueryType: queryType,
		Pattern:   pattern,
		Action:    "blocked",
		Source:    "dns_query",
	}

	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	// Write JSON line
	if _, err := l.file.Write(append(data, '\n')); err != nil {
		return err
	}

	return l.file.Sync()
}

// Close closes the logger
func (l *EventLogger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.file != nil {
		return l.file.Close()
	}
	return nil
}

// Rotate rotates the log file (for cleanup after collection)
func (l *EventLogger) Rotate() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.file != nil {
		l.file.Close()
	}

	// Truncate the file
	file, err := os.OpenFile(l.logPath, os.O_TRUNC|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}

	l.file = file
	return nil
}
