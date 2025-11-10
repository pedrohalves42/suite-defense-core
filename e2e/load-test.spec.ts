import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

const CONCURRENT_AGENTS = 10;
const POLL_ITERATIONS = 5;

function generateHmac(secret: string, body: string, timestamp: string): string {
  const payload = `${timestamp}:${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

interface AgentCredentials {
  agentName: string;
  agentToken: string;
  hmacSecret: string;
}

test.describe('Load Testing - Multiple Agents', () => {
  let authToken: string;
  let agents: AgentCredentials[] = [];

  test.beforeAll(async ({ request }) => {
    // Login como admin
    const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        email: process.env.TEST_ADMIN_EMAIL || 'pedrohalves42@gmail.com',
        password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
      },
    });

    const loginData = await loginResponse.json();
    authToken = loginData.access_token;
  });

  test('1. Setup - Enroll multiple agents', async ({ request }) => {
    const enrollmentPromises = [];

    for (let i = 0; i < CONCURRENT_AGENTS; i++) {
      const agentName = `load-test-agent-${Date.now()}-${i}`;
      
      // Gerar enrollment key
      const enrollKeyPromise = request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName },
      }).then(async (enrollResponse) => {
        const enrollData = await enrollResponse.json();
        
        // Enroll agent
        const agentResponse = await request.post(`${SUPABASE_URL}/functions/v1/enroll-agent`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: {
            enrollmentKey: enrollData.enrollmentKey,
            agentName: agentName,
            systemInfo: {
              os: 'Windows 10',
              hostname: `load-test-${i}`,
              version: '1.0.0',
            },
          },
        });
        
        const agentData = await agentResponse.json();
        return {
          agentName,
          agentToken: agentData.agentToken,
          hmacSecret: agentData.hmacSecret,
        };
      });

      enrollmentPromises.push(enrollKeyPromise);
    }

    agents = await Promise.all(enrollmentPromises);
    expect(agents.length).toBe(CONCURRENT_AGENTS);
    console.log(`✓ ${CONCURRENT_AGENTS} agents enrolled successfully`);
  });

  test('2. Load Test - Concurrent heartbeats', async ({ request }) => {
    const startTime = Date.now();
    const heartbeatPromises = [];

    for (const agent of agents) {
      const timestamp = Date.now().toString();
      const body = JSON.stringify({ status: 'active' });
      const hmacSignature = generateHmac(agent.hmacSecret, body, timestamp);

      heartbeatPromises.push(
        request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
          headers: {
            'X-Agent-Token': agent.agentToken,
            'X-HMAC-Signature': hmacSignature,
            'X-Timestamp': timestamp,
            'Content-Type': 'application/json',
          },
          data: JSON.parse(body),
        })
      );
    }

    const responses = await Promise.all(heartbeatPromises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    const successCount = responses.filter(r => r.ok()).length;
    const failCount = responses.filter(r => !r.ok()).length;

    console.log(`\n=== Concurrent Heartbeats Load Test ===`);
    console.log(`Total agents: ${CONCURRENT_AGENTS}`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Avg response time: ${duration / CONCURRENT_AGENTS}ms`);

    expect(successCount).toBeGreaterThan(0);
  });

  test('3. Load Test - Sequential poll-jobs', async ({ request }) => {
    // Criar jobs para todos os agents
    const jobCreationPromises = agents.map(agent => 
      request.post(`${SUPABASE_URL}/functions/v1/create-job`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: {
          agentName: agent.agentName,
          type: 'collect_info',
          payload: { info_type: 'system' },
        },
      })
    );

    await Promise.all(jobCreationPromises);

    // Realizar múltiplas iterações de poll
    const pollResults = [];
    for (let iteration = 0; iteration < POLL_ITERATIONS; iteration++) {
      const startTime = Date.now();
      const pollPromises = [];

      for (const agent of agents) {
        const timestamp = Date.now().toString();
        const body = '';
        const hmacSignature = generateHmac(agent.hmacSecret, body, timestamp);

        pollPromises.push(
          request.post(`${SUPABASE_URL}/functions/v1/poll-jobs`, {
            headers: {
              'X-Agent-Token': agent.agentToken,
              'X-HMAC-Signature': hmacSignature,
              'X-Timestamp': timestamp,
              'Content-Type': 'application/json',
            },
          })
        );
      }

      const responses = await Promise.all(pollPromises);
      const endTime = Date.now();
      
      pollResults.push({
        iteration: iteration + 1,
        duration: endTime - startTime,
        successCount: responses.filter(r => r.ok()).length,
        failCount: responses.filter(r => !r.ok()).length,
      });

      // Aguardar 1 segundo entre iterações
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n=== Poll-Jobs Load Test ===`);
    pollResults.forEach(result => {
      console.log(`Iteration ${result.iteration}: ${result.duration}ms (Success: ${result.successCount}, Failed: ${result.failCount})`);
    });

    const avgDuration = pollResults.reduce((sum, r) => sum + r.duration, 0) / pollResults.length;
    console.log(`Average duration: ${avgDuration.toFixed(2)}ms`);

    expect(pollResults.every(r => r.successCount > 0)).toBe(true);
  });

  test('4. Load Test - Mixed operations', async ({ request }) => {
    const startTime = Date.now();
    const operations = [];

    for (const agent of agents) {
      const timestamp = Date.now().toString();
      
      // Heartbeat
      const heartbeatBody = JSON.stringify({ status: 'active' });
      const heartbeatHmac = generateHmac(agent.hmacSecret, heartbeatBody, timestamp);
      operations.push(
        request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
          headers: {
            'X-Agent-Token': agent.agentToken,
            'X-HMAC-Signature': heartbeatHmac,
            'X-Timestamp': timestamp,
            'Content-Type': 'application/json',
          },
          data: JSON.parse(heartbeatBody),
        })
      );

      // Poll jobs
      const pollBody = '';
      const pollHmac = generateHmac(agent.hmacSecret, pollBody, timestamp);
      operations.push(
        request.post(`${SUPABASE_URL}/functions/v1/poll-jobs`, {
          headers: {
            'X-Agent-Token': agent.agentToken,
            'X-HMAC-Signature': pollHmac,
            'X-Timestamp': timestamp,
            'Content-Type': 'application/json',
          },
        })
      );

      // Create job
      operations.push(
        request.post(`${SUPABASE_URL}/functions/v1/create-job`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: {
            agentName: agent.agentName,
            type: 'collect_info',
            payload: {},
          },
        })
      );
    }

    const responses = await Promise.all(operations);
    const endTime = Date.now();
    const duration = endTime - startTime;

    const successCount = responses.filter(r => r.ok()).length;
    const failCount = responses.filter(r => !r.ok()).length;
    const totalOps = CONCURRENT_AGENTS * 3;

    console.log(`\n=== Mixed Operations Load Test ===`);
    console.log(`Total operations: ${totalOps}`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Ops/second: ${(totalOps / (duration / 1000)).toFixed(2)}`);

    expect(successCount).toBeGreaterThan(totalOps * 0.8); // 80% success rate
  });

  test('5. Performance - Response time analysis', async ({ request }) => {
    const responseTimes = [];

    for (const agent of agents) {
      const timestamp = Date.now().toString();
      const body = JSON.stringify({ status: 'active' });
      const hmacSignature = generateHmac(agent.hmacSecret, body, timestamp);

      const startTime = Date.now();
      await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
        headers: {
          'X-Agent-Token': agent.agentToken,
          'X-HMAC-Signature': hmacSignature,
          'X-Timestamp': timestamp,
          'Content-Type': 'application/json',
        },
        data: JSON.parse(body),
      });
      const endTime = Date.now();
      
      responseTimes.push(endTime - startTime);
    }

    const avgResponseTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
    const minResponseTime = Math.min(...responseTimes);
    const maxResponseTime = Math.max(...responseTimes);

    console.log(`\n=== Response Time Analysis ===`);
    console.log(`Average: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Min: ${minResponseTime}ms`);
    console.log(`Max: ${maxResponseTime}ms`);

    expect(avgResponseTime).toBeLessThan(5000); // Média < 5 segundos
  });
});
