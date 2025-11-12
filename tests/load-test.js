/**
 * Load Test Script - CyberShield
 * 
 * Execute: k6 run tests/load-test.js
 * 
 * Scenarios:
 * - Smoke Test: 1 VU por 30s (validação básica)
 * - Average Load: 50 VUs por 5min (carga média)
 * - Stress Test: ramp 0→500 VUs em 10min (stress)
 * - Spike Test: 0→1000 VUs em 1min (pico)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom Metrics
const errorRate = new Rate('errors');
const heartbeatDuration = new Trend('heartbeat_duration');
const enrollmentDuration = new Trend('enrollment_duration');
const authDuration = new Trend('auth_duration');
const apiCalls = new Counter('api_calls');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1';
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

export const options = {
  scenarios: {
    // 1. Smoke Test - Validação básica
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' },
      exec: 'smokeTest',
    },
    
    // 2. Average Load - Carga média esperada
    average_load: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      startTime: '30s',
      tags: { test_type: 'average' },
      exec: 'averageLoad',
    },
    
    // 3. Stress Test - Aumento gradual até 500 agents
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 300 },
        { duration: '3m', target: 500 },
        { duration: '2m', target: 0 },
      ],
      startTime: '6m',
      tags: { test_type: 'stress' },
      exec: 'stressTest',
    },
    
    // 4. Spike Test - Pico súbito de tráfego
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 1000 },
        { duration: '1m', target: 1000 },
        { duration: '10s', target: 0 },
      ],
      startTime: '18m',
      tags: { test_type: 'spike' },
      exec: 'spikeTest',
    },
  },
  
  thresholds: {
    // Performance Targets (APEX Requirements)
    http_req_duration: ['p(95)<150', 'p(99)<300'], // p95 < 150ms, p99 < 300ms
    'http_req_duration{test_type:smoke}': ['p(95)<100'],
    'http_req_duration{test_type:average}': ['p(95)<150'],
    'http_req_duration{test_type:stress}': ['p(95)<300'],
    'http_req_duration{test_type:spike}': ['p(95)<500'],
    
    // Error Rate
    errors: ['rate<0.01'], // < 1% error rate
    http_req_failed: ['rate<0.01'],
    
    // Throughput
    http_reqs: ['rate>100'], // Min 100 req/s
  },
};

// Test Data
const agents = [];
for (let i = 0; i < 1000; i++) {
  agents.push({
    agent_name: `agent-${String(i).padStart(4, '0')}`,
    agent_token: `token-${Math.random().toString(36).substring(7)}`,
    hmac_secret: `hmac-${Math.random().toString(36).substring(7)}`,
  });
}

// Helper: Generate HMAC signature (simplified for testing)
function generateSignature() {
  return Math.random().toString(36).substring(7);
}

// 1. Smoke Test - Validação básica
export function smokeTest() {
  const agent = agents[0];
  
  // Test: Health check (heartbeat)
  const heartbeatRes = http.post(
    `${BASE_URL}/heartbeat`,
    JSON.stringify({
      agent_name: agent.agent_name,
      os_type: 'Windows',
      os_version: '10.0.19045',
      hostname: 'TEST-MACHINE',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${agent.agent_token}`,
        'x-hmac-signature': generateSignature(),
      },
    }
  );
  
  check(heartbeatRes, {
    'heartbeat status 200': (r) => r.status === 200,
    'heartbeat duration < 100ms': (r) => r.timings.duration < 100,
  });
  
  errorRate.add(heartbeatRes.status !== 200);
  heartbeatDuration.add(heartbeatRes.timings.duration);
  apiCalls.add(1);
  
  sleep(1);
}

// 2. Average Load - Simula carga média de 50 agents
export function averageLoad() {
  const agent = agents[Math.floor(Math.random() * 50)];
  
  // Heartbeat
  const heartbeatRes = http.post(
    `${BASE_URL}/heartbeat`,
    JSON.stringify({
      agent_name: agent.agent_name,
      os_type: 'Windows',
      os_version: '10.0.19045',
      hostname: `AGENT-${agent.agent_name}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${agent.agent_token}`,
        'x-hmac-signature': generateSignature(),
      },
    }
  );
  
  check(heartbeatRes, {
    'avg load heartbeat 200': (r) => r.status === 200,
  });
  
  errorRate.add(heartbeatRes.status !== 200);
  apiCalls.add(1);
  
  // Poll jobs
  const jobsRes = http.post(
    `${BASE_URL}/poll-jobs`,
    JSON.stringify({ agent_name: agent.agent_name }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${agent.agent_token}`,
        'x-hmac-signature': generateSignature(),
      },
    }
  );
  
  check(jobsRes, {
    'poll jobs 200': (r) => r.status === 200,
  });
  
  errorRate.add(jobsRes.status !== 200);
  apiCalls.add(1);
  
  sleep(Math.random() * 3 + 2); // 2-5s between requests
}

// 3. Stress Test - Aumenta gradualmente até 500 agents
export function stressTest() {
  const agent = agents[Math.floor(Math.random() * 500)];
  
  const heartbeatRes = http.post(
    `${BASE_URL}/heartbeat`,
    JSON.stringify({
      agent_name: agent.agent_name,
      os_type: 'Linux',
      os_version: 'Ubuntu 22.04',
      hostname: `SERVER-${agent.agent_name}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${agent.agent_token}`,
        'x-hmac-signature': generateSignature(),
      },
      timeout: '10s',
    }
  );
  
  check(heartbeatRes, {
    'stress heartbeat 200': (r) => r.status === 200,
    'stress duration < 300ms': (r) => r.timings.duration < 300,
  });
  
  errorRate.add(heartbeatRes.status !== 200);
  apiCalls.add(1);
  
  sleep(Math.random() * 2 + 1); // 1-3s
}

// 4. Spike Test - Pico súbito de 1000 agents
export function spikeTest() {
  const agent = agents[Math.floor(Math.random() * 1000)];
  
  const heartbeatRes = http.post(
    `${BASE_URL}/heartbeat`,
    JSON.stringify({
      agent_name: agent.agent_name,
      os_type: 'Windows',
      os_version: '11.0.22000',
      hostname: `SPIKE-${agent.agent_name}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${agent.agent_token}`,
        'x-hmac-signature': generateSignature(),
      },
      timeout: '15s',
    }
  );
  
  check(heartbeatRes, {
    'spike heartbeat not failed': (r) => r.status !== 0,
  });
  
  errorRate.add(heartbeatRes.status !== 200);
  apiCalls.add(1);
  
  sleep(0.5); // Agressivo
}

// Summary Handler
export function handleSummary(data) {
  return {
    'tests/load-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, config) {
  const indent = config.indent || '';
  const enableColors = config.enableColors || false;
  
  let summary = '\n';
  summary += `${indent}========================================\n`;
  summary += `${indent}📊 APEX LOAD TEST RESULTS\n`;
  summary += `${indent}========================================\n\n`;
  
  // Metrics
  const metrics = data.metrics;
  
  summary += `${indent}🚀 Performance:\n`;
  summary += `${indent}  - p95 duration: ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2)}ms\n`;
  summary += `${indent}  - p99 duration: ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2)}ms\n`;
  summary += `${indent}  - Avg duration: ${metrics.http_req_duration?.values?.avg?.toFixed(2)}ms\n`;
  
  summary += `\n${indent}📈 Throughput:\n`;
  summary += `${indent}  - Total requests: ${metrics.http_reqs?.values?.count}\n`;
  summary += `${indent}  - Requests/s: ${metrics.http_reqs?.values?.rate?.toFixed(2)}\n`;
  
  summary += `\n${indent}❌ Errors:\n`;
  summary += `${indent}  - Error rate: ${(metrics.errors?.values?.rate * 100)?.toFixed(2)}%\n`;
  summary += `${indent}  - Failed requests: ${metrics.http_req_failed?.values?.passes}/${metrics.http_req_failed?.values?.fails}\n`;
  
  summary += `\n${indent}========================================\n`;
  
  // Thresholds status
  const thresholds = data.thresholds;
  let passed = 0;
  let failed = 0;
  
  for (const [name, result] of Object.entries(thresholds)) {
    if (result.ok) passed++;
    else failed++;
  }
  
  const statusIcon = failed === 0 ? '✅' : '🔴';
  summary += `${indent}${statusIcon} Thresholds: ${passed} passed, ${failed} failed\n`;
  summary += `${indent}========================================\n\n`;
  
  return summary;
}
