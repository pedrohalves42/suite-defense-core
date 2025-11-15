import { test, expect } from '@playwright/test';

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

  test.skip('Health check with valid HMAC should succeed', async ({ request }) => {
    // TODO: implementar geração de HMAC válido
    // const validToken = generateValidToken();
    // const signature = generateHMAC(validToken);
    
    // const response = await request.post('/functions/v1/agent-health-check', {
    //   headers: {
    //     'X-Agent-Token': validToken,
    //     'X-HMAC-Signature': signature.signature,
    //     'X-Timestamp': signature.timestamp,
    //     'X-Nonce': signature.nonce,
    //   },
    // });
    
    // expect(response.status()).toBe(200);
    // const body = await response.json();
    // expect(body.status).toBe('ok');
    // expect(body.hmac.valid).toBe(true);
  });

  test.skip('Timestamp out of range should return transient flag', async ({ request }) => {
    // TODO: testar com timestamp antigo (> 5 min)
  });
});
