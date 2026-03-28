/**
 * Seed data constants for integration tests.
 * These represent realistic but fake data for testing edge functions.
 */

export const SEED = {
  // Agent payloads
  heartbeat: {
    agent_name: "test-agent-001",
    agent_version: "v5.0.15",
    hostname: "TEST-PC-001",
    system_metrics: {
      cpu_percent: 12.5,
      memory_used_percent: 45.2,
      disk_used_percent: 68.3,
      uptime_seconds: 86400,
    },
    ecdsa_enabled: true,
  },

  systemMetrics: {
    cpu_percent: 25.3,
    memory_total_gb: 16,
    memory_used_gb: 8.2,
    memory_used_percent: 51.25,
    disk_total_gb: 500,
    disk_used_gb: 250,
    disk_used_percent: 50,
    uptime_seconds: 172800,
    network_bytes_sent: 1024000,
    network_bytes_received: 2048000,
    top_processes: [
      { name: "chrome.exe", cpu: 5.2, memory_mb: 512 },
      { name: "code.exe", cpu: 3.1, memory_mb: 256 },
    ],
  },

  softwareInventory: {
    software: [
      {
        name: "Google Chrome",
        version: "120.0.6099.130",
        publisher: "Google LLC",
        install_date: "2024-01-15",
      },
      {
        name: "Visual Studio Code",
        version: "1.85.1",
        publisher: "Microsoft Corporation",
        install_date: "2024-01-10",
      },
    ],
  },

  webActivity: {
    entries: [
      {
        url: "https://example.com",
        title: "Example Site",
        browser: "Chrome",
        visited_at: new Date().toISOString(),
        duration_seconds: 120,
      },
    ],
  },

  // Admin payloads
  createUser: {
    email: `test-${Date.now()}@example.com`,
    password: "TestPass123!",
    full_name: "Test User",
    role: "viewer",
  },

  createJob: {
    job_type: "scan",
    priority: "normal",
    target_agent_id: "00000000-0000-0000-0000-000000000000",
    parameters: { scan_type: "quick" },
  },

  // Evidence payloads
  evidence: {
    agent_name: "test-agent-001",
    event_type: "file_write",
    severity: "info",
    event_data: {
      path: "/tmp/test.txt",
      action: "created",
      size_bytes: 1024,
    },
  },
} as const;
