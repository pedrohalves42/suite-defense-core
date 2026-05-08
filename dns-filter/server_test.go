package main

import "testing"

func TestDNSServerStopIsIdempotent(t *testing.T) {
	server := &DNSServer{stopChan: make(chan struct{})}

	server.Stop()
	server.Stop()
}
