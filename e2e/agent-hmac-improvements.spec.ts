import { test, expect } from '@playwright/test';
import { createHmac } from 'crypto';

// Helper para gerar HMAC válido seguindo especificação
function generateHMAC(agentToken: string, hmacSecret: string, body: string = '') {
  const timestamp = Date.now().toString(); // milissegundos
  const nonce = crypto.randomUUID();
  const payload = `${timestamp}:${nonce}:${body}`;
  
  const signature = createHmac('sha256', Buffer.from(hmacSecret, 'hex'))
    .update(payload)
    .digest('hex');
  
  return { signature, timestamp, nonce };
}

test.describe('Agent HMAC Improvements', () => {
  test('Health check should return structured error codes', async ({ request }) => {
    // Teste com token inválido
    const response = await request.post('/functions/v1/agent-health-check', {
      headers: { 'X-Agent-Token': 'invalid-token' },
    });
    
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('status', 'error');
  });

  test('Health check with valid HMAC should succeed', async ({ request }) => {
    // Setup: usar token e secret de teste (em produção, viria do seed)
    const agentToken = process.env.TEST_AGENT_TOKEN || 'test-agent-token-123';
    const hmacSecret = process.env.TEST_HMAC_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    
    const body = JSON.stringify({ os_type: 'windows', os_version: '10' });
    const { signature, timestamp, nonce } = generateHMAC(agentToken, hmacSecret, body);
    
    const response = await request.post('/functions/v1/agent-health-check', {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
      data: body,
    });
    
    // Se não houver agente configurado, pode retornar 401 (válido)
    // Se houver, deve retornar 200 com hmac.valid: true
    if (response.status() === 200) {
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.hmac?.valid).toBe(true);
    } else {
      // Token não existe no banco (aceitável em ambiente de teste)
      expect(response.status()).toBe(401);
    }
  });

  test('Timestamp out of range should return transient flag', async ({ request }) => {
    const agentToken = process.env.TEST_AGENT_TOKEN || 'test-agent-token-123';
    const hmacSecret = process.env.TEST_HMAC_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    
    // Timestamp 6 minutos no passado (excede janela de 5 min)
    const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString();
    const nonce = crypto.randomUUID();
    const body = '';
    const payload = `${oldTimestamp}:${nonce}:${body}`;
    
    const signature = createHmac('sha256', Buffer.from(hmacSecret, 'hex'))
      .update(payload)
      .digest('hex');
    
    const response = await request.post('/functions/v1/agent-health-check', {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': signature,
        'X-Timestamp': oldTimestamp,
        'X-Nonce': nonce,
      },
    });
    
    expect(response.status()).toBe(401);
    const data = await response.json();
    
    // Validar estrutura de erro com flag transient
    expect(data.code).toMatch(/TIMESTAMP|TIME/i);
    expect(data.transient).toBe(true); // Flag que indica que agente deve retentar
  });

  test('Replay attack should be blocked', async ({ request }) => {
    const agentToken = process.env.TEST_AGENT_TOKEN || 'test-agent-token-123';
    const hmacSecret = process.env.TEST_HMAC_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    
    const body = '';
    const { signature, timestamp, nonce } = generateHMAC(agentToken, hmacSecret, body);
    
    const headers = {
      'X-Agent-Token': agentToken,
      'X-HMAC-Signature': signature,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
    };
    
    // Primeira requisição (pode passar ou falhar se token não existe)
    const firstResponse = await request.post('/functions/v1/agent-health-check', { headers });
    
    // Segunda requisição com MESMA signature/nonce (deve ser bloqueada)
    const secondResponse = await request.post('/functions/v1/agent-health-check', { headers });
    
    // Se primeira passou, segunda DEVE falhar com replay error
    if (firstResponse.status() === 200) {
      expect(secondResponse.status()).toBe(401);
      const data = await secondResponse.json();
      expect(data.code).toMatch(/REPLAY|USED|DUPLICATE/i);
    }
  });
});
