import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

test.describe('Installer Token Validation', () => {
  let supabaseClient: ReturnType<typeof createClient>;
  let authToken: string;
  let userId: string;
  let tenantId: string;
  let agentId: string;
  let agentName: string;
  let enrollmentKey: string;

  test.beforeAll(async () => {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Login como admin
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email: 'pedro@atlaviamit.pt',
      password: 'Pedro@123',
    });

    if (authError || !authData.session) {
      throw new Error(`Auth failed: ${authError?.message}`);
    }

    authToken = authData.session.access_token;
    userId = authData.user!.id;

    // Buscar tenant_id
    const { data: tenantData, error: tenantError } = await supabaseClient
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', userId)
      .single();

    if (tenantError || !tenantData) {
      throw new Error(`Failed to fetch tenant: ${tenantError?.message}`);
    }

    tenantId = tenantData.tenant_id;

    // Gerar nome único para o agente
    agentName = `test-token-validation-${Date.now()}`;

    console.log('[Setup] Login successful', {
      userId: userId.substring(0, 8),
      tenantId: tenantId.substring(0, 8),
      agentName,
    });
  });

  test.afterAll(async () => {
    // Cleanup: remover agente de teste
    if (agentId) {
      try {
        await supabaseClient.from('agents').delete().eq('id', agentId);
        console.log(`[Cleanup] Agent ${agentName} removed`);
      } catch (error) {
        console.warn(`[Cleanup] Failed to remove agent: ${error}`);
      }
    }
  });

  test('1. Generate agent with enrollment key', async () => {
    // Chamar auto-generate-enrollment
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/auto-generate-enrollment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          agent_name: agentName,
          os_type: 'windows',
        }),
      }
    );

    expect(response.status).toBe(201);

    const data = await response.json();
    console.log('[Test 1] Agent created:', {
      agentId: data.agent_id?.substring(0, 8),
      enrollmentKey: data.enrollment_key?.substring(0, 8),
    });

    expect(data).toHaveProperty('agent_id');
    expect(data).toHaveProperty('enrollment_key');
    expect(data).toHaveProperty('agent_token');

    agentId = data.agent_id;
    enrollmentKey = data.enrollment_key;

    // Salvar token esperado do backend
    const expectedToken = data.agent_token;
    expect(expectedToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Armazenar para próximo teste
    test.info().annotations.push({ type: 'expectedToken', description: expectedToken });
  });

  test('2. Download installer and validate token consistency', async () => {
    expect(enrollmentKey).toBeDefined();

    // Baixar instalador via serve-installer
    const installerResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
      }
    );

    expect(installerResponse.status).toBe(200);

    const installerScript = await installerResponse.text();
    expect(installerScript).toContain('CyberShield Agent');
    expect(installerScript.length).toBeGreaterThan(10000);

    // Buscar token ATIVO do backend
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('agent_tokens')
      .select('token')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(tokenError).toBeNull();
    expect(tokenData).toBeTruthy();

    const activeTokenFromDB = tokenData!.token;
    console.log('[Test 2] Active token from DB:', activeTokenFromDB.substring(0, 8));

    // Extrair token do instalador (formato: $AgentToken = "uuid")
    const tokenMatch = installerScript.match(/\$AgentToken\s*=\s*"([^"]+)"/);
    expect(tokenMatch).toBeTruthy();

    const tokenInInstaller = tokenMatch![1];
    console.log('[Test 2] Token in installer:', tokenInInstaller.substring(0, 8));

    // VALIDAÇÃO CRÍTICA: Token no instalador DEVE ser idêntico ao token ativo no DB
    expect(tokenInInstaller).toBe(activeTokenFromDB);

    console.log('[Test 2] ✅ Token consistency validated!');
  });

  test('3. Validate installer has self-test', async () => {
    expect(enrollmentKey).toBeDefined();

    const installerResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
      }
    );

    expect(installerResponse.status).toBe(200);
    const installerScript = await installerResponse.text();

    // Validar presença do self-test
    expect(installerScript).toContain('FASE 3: SELF-TEST');
    expect(installerScript).toContain('Executando self-test de conectividade');
    expect(installerScript).toContain('/functions/v1/heartbeat');
    expect(installerScript).toContain('Self-test PASSOU');
    expect(installerScript).toContain('Self-test FALHOU');
    expect(installerScript).toContain('TOKEN OU HMAC SECRET INVÁLIDOS');
    expect(installerScript).toContain('exit 401');

    console.log('[Test 3] ✅ Self-test is present in installer');
  });

  test('4. Validate installer has cleanup logic', async () => {
    expect(enrollmentKey).toBeDefined();

    const installerResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
      }
    );

    expect(installerResponse.status).toBe(200);
    const installerScript = await installerResponse.text();

    // Validar presença do cleanup
    expect(installerScript).toContain('FASE 1: CLEANUP DE INSTALAÇÕES ANTIGAS');
    expect(installerScript).toContain('Limpando instalações anteriores');
    expect(installerScript).toContain('Get-ScheduledTask');
    expect(installerScript).toContain('Unregister-ScheduledTask');
    expect(installerScript).toContain('Stop-Process');
    expect(installerScript).toContain('cybershield-agent');

    console.log('[Test 4] ✅ Cleanup logic is present in installer');
  });

  test('5. Validate installer uses absolute PowerShell path', async () => {
    expect(enrollmentKey).toBeDefined();

    const installerResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
      }
    );

    expect(installerResponse.status).toBe(200);
    const installerScript = await installerResponse.text();

    // Validar uso de caminho absoluto do PowerShell
    expect(installerScript).toContain('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');

    console.log('[Test 5] ✅ Absolute PowerShell path is used');
  });

  test('6. Validate installer logs token/HMAC prefixes', async () => {
    expect(enrollmentKey).toBeDefined();

    const installerResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
        },
      }
    );

    expect(installerResponse.status).toBe(200);
    const installerScript = await installerResponse.text();

    // Validar logging de prefixos
    expect(installerScript).toContain('$TokenPrefix');
    expect(installerScript).toContain('$HmacPrefix');
    expect(installerScript).toContain('AgentToken:');
    expect(installerScript).toContain('HmacSecret:');

    console.log('[Test 6] ✅ Token/HMAC prefix logging is present');
  });
});
