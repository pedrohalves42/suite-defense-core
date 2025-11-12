import { test, expect } from '@playwright/test';

test.describe('Agent Creation After RLS Fix', () => {
  const baseUrl = process.env.VITE_SUPABASE_URL!;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  let authToken: string;
  let tenantId: string;

  test.beforeAll(async ({ request }) => {
    // Login como admin
    const loginResponse = await request.post(`${baseUrl}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': anonKey,
        'Content-Type': 'application/json',
      },
      data: {
        email: 'admin@example.com',
        password: 'admin123',
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    authToken = loginData.access_token;

    // Buscar tenant_id do admin
    const tenantResponse = await request.get(`${baseUrl}/rest/v1/user_roles?user_id=eq.${loginData.user.id}&select=tenant_id&limit=1`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${authToken}`,
      },
    });

    expect(tenantResponse.ok()).toBeTruthy();
    const tenantData = await tenantResponse.json();
    tenantId = tenantData[0].tenant_id;
  });

  test('should generate agent installer successfully with multiple user roles', async ({ request }) => {
    const agentName = `TEST-AGENT-RLS-${Date.now()}`;

    console.log('[Test] Generating installer for agent:', agentName);

    // Chamar auto-generate-enrollment
    const response = await request.post(`${baseUrl}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
        platform: 'windows',
      },
    });

    console.log('[Test] Response status:', response.status());
    const responseData = await response.json();
    console.log('[Test] Response data:', responseData);

    expect(response.ok()).toBeTruthy();
    expect(responseData).toHaveProperty('enrollmentKey');
    expect(responseData).toHaveProperty('agentToken');
    expect(responseData).toHaveProperty('hmacSecret');
    expect(responseData).toHaveProperty('agentId');

    // Validar que o enrollment key foi criado
    const enrollmentKeyCheck = await request.get(
      `${baseUrl}/rest/v1/enrollment_keys?key=eq.${responseData.enrollmentKey}&select=*`,
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );

    expect(enrollmentKeyCheck.ok()).toBeTruthy();
    const enrollmentKeys = await enrollmentKeyCheck.json();
    expect(enrollmentKeys.length).toBe(1);
    expect(enrollmentKeys[0].tenant_id).toBe(tenantId);
    expect(enrollmentKeys[0].agent_id).toBe(responseData.agentId);

    // Validar que o agente foi criado
    const agentCheck = await request.get(
      `${baseUrl}/rest/v1/agents?id=eq.${responseData.agentId}&select=*`,
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );

    expect(agentCheck.ok()).toBeTruthy();
    const agents = await agentCheck.json();
    expect(agents.length).toBe(1);
    expect(agents[0].agent_name).toBe(agentName);
    expect(agents[0].tenant_id).toBe(tenantId);
    expect(agents[0].status).toBe('pending');

    // Validar que o agent token foi criado
    const tokenCheck = await request.get(
      `${baseUrl}/rest/v1/agent_tokens?agent_id=eq.${responseData.agentId}&select=*`,
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );

    expect(tokenCheck.ok()).toBeTruthy();
    const tokens = await tokenCheck.json();
    expect(tokens.length).toBe(1);
    expect(tokens[0].is_active).toBe(true);
  });

  test('should track installation event successfully', async ({ request }) => {
    const agentName = `TEST-AGENT-INSTALL-${Date.now()}`;

    // Gerar instalador
    const generateResponse = await request.post(`${baseUrl}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
        platform: 'linux',
      },
    });

    expect(generateResponse.ok()).toBeTruthy();
    const { agentId } = await generateResponse.json();

    // Simular evento de instalação
    const trackResponse = await request.post(`${baseUrl}/functions/v1/track-installation-event`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
        agentId: agentId,
        eventType: 'installation_success',
        platform: 'linux',
        installationMethod: 'one_click',
        installationTimeSeconds: 45,
      },
    });

    expect(trackResponse.ok()).toBeTruthy();

    // Validar que o evento foi registrado
    const analyticsCheck = await request.get(
      `${baseUrl}/rest/v1/installation_analytics?agent_id=eq.${agentId}&event_type=eq.installation_success&select=*`,
      {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );

    expect(analyticsCheck.ok()).toBeTruthy();
    const analytics = await analyticsCheck.json();
    expect(analytics.length).toBeGreaterThan(0);
    expect(analytics[0].agent_name).toBe(agentName);
    expect(analytics[0].platform).toBe('linux');
    expect(analytics[0].installation_method).toBe('one_click');
  });

  test('should handle get-agent-dashboard-data with multiple roles correctly', async ({ request }) => {
    // Chamar a função que estava falhando antes da correção
    const dashboardResponse = await request.post(`${baseUrl}/functions/v1/get-agent-dashboard-data`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Test] Dashboard response status:', dashboardResponse.status());
    const dashboardData = await dashboardResponse.json();
    console.log('[Test] Dashboard data:', dashboardData);

    expect(dashboardResponse.status()).toBe(200);
    expect(dashboardData).toHaveProperty('summary');
    expect(dashboardData).toHaveProperty('agents');
    expect(dashboardData).toHaveProperty('recent_alerts');
    expect(dashboardData.summary).toHaveProperty('total_agents');
    expect(dashboardData.summary).toHaveProperty('online_agents');
    expect(dashboardData.summary).toHaveProperty('offline_agents');
  });
});
