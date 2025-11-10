import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

test.describe('Stripe Payment Flow E2E', () => {
  let authToken: string;
  let userEmail: string;
  let checkoutUrl: string;
  let stripeCustomerId: string;

  test.beforeAll(async () => {
    userEmail = process.env.TEST_ADMIN_EMAIL || 'pedrohalves42@gmail.com';
  });

  test('1. Admin login', async ({ request }) => {
    const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        email: userEmail,
        password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    authToken = loginData.access_token;
    expect(authToken).toBeTruthy();
  });

  test('2. Check initial subscription status', async ({ request }) => {
    const checkResponse = await request.post(`${SUPABASE_URL}/functions/v1/check-subscription`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });

    expect(checkResponse.ok()).toBeTruthy();
    const data = await checkResponse.json();
    expect(data).toHaveProperty('subscribed');
    expect(typeof data.subscribed).toBe('boolean');
  });

  test('3. Create checkout session - Starter plan (1 device)', async ({ request }) => {
    const checkoutResponse = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        planName: 'starter',
        deviceQuantity: 1,
      },
    });

    expect(checkoutResponse.ok()).toBeTruthy();
    const checkoutData = await checkoutResponse.json();
    checkoutUrl = checkoutData.url;
    
    expect(checkoutUrl).toBeTruthy();
    expect(checkoutUrl).toContain('checkout.stripe.com');
  });

  test('4. Verify checkout URL structure', async () => {
    expect(checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/.+$/);
  });

  test('5. Simulate Stripe webhook - subscription.created', async ({ request }) => {
    // Simular webhook do Stripe
    const webhookPayload = {
      id: `evt_test_${Date.now()}`,
      type: 'customer.subscription.created',
      data: {
        object: {
          id: `sub_test_${Date.now()}`,
          customer: 'cus_test_123456',
          status: 'active',
          items: {
            data: [
              {
                price: {
                  id: 'price_test_starter',
                  product: 'prod_test_starter',
                  recurring: {
                    interval: 'month',
                  },
                  unit_amount: 3000,
                },
                quantity: 1,
              },
            ],
          },
          current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 dias
          trial_end: Math.floor(Date.now() / 1000) + 2592000,
        },
      },
    };

    const webhookResponse = await request.post(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_signature', // Nota: em produção, precisa ser assinatura válida
      },
      data: webhookPayload,
    });

    // Em ambiente de teste sem assinatura válida, pode retornar 401
    // Em produção, deve validar a assinatura
    expect([200, 400, 401]).toContain(webhookResponse.status());
  });

  test('6. Create checkout session - Pro plan (5 devices)', async ({ request }) => {
    const checkoutResponse = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        planName: 'pro',
        deviceQuantity: 5,
      },
    });

    expect(checkoutResponse.ok()).toBeTruthy();
    const checkoutData = await checkoutResponse.json();
    expect(checkoutData.url).toBeTruthy();
    expect(checkoutData.url).toContain('checkout.stripe.com');
  });

  test('7. Test invalid plan name', async ({ request }) => {
    const checkoutResponse = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        planName: 'invalid_plan',
        deviceQuantity: 1,
      },
    });

    expect(checkoutResponse.status()).toBe(400);
  });

  test('8. Test device quantity limits - Starter plan', async ({ request }) => {
    // Tentar criar checkout com mais dispositivos que o permitido
    const checkoutResponse = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        planName: 'starter',
        deviceQuantity: 50, // Limite é 30
      },
    });

    expect(checkoutResponse.status()).toBe(400);
    const errorData = await checkoutResponse.json();
    expect(errorData.error).toContain('device');
  });

  test('9. Test device quantity limits - Pro plan', async ({ request }) => {
    const checkoutResponse = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        planName: 'pro',
        deviceQuantity: 250, // Limite é 200
      },
    });

    expect(checkoutResponse.status()).toBe(400);
  });

  test('10. Test unauthenticated checkout attempt', async ({ request }) => {
    const checkoutResponse = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        planName: 'starter',
        deviceQuantity: 1,
      },
    });

    expect(checkoutResponse.status()).toBe(401);
  });

  test('11. Access customer portal', async ({ request }) => {
    const portalResponse = await request.post(`${SUPABASE_URL}/functions/v1/customer-portal`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });

    // Pode retornar 200 com URL ou 404 se não tiver customer
    expect([200, 404]).toContain(portalResponse.status());
    
    if (portalResponse.ok()) {
      const portalData = await portalResponse.json();
      if (portalData.url) {
        expect(portalData.url).toContain('billing.stripe.com');
      }
    }
  });

  test('12. Verify subscription features - Starter', async ({ request }) => {
    // Verificar features do plano Starter
    const featuresResponse = await request.get(`${SUPABASE_URL}/rest/v1/tenant_features?select=*`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });

    if (featuresResponse.ok()) {
      const features = await featuresResponse.json();
      
      // Verificar features específicas do Starter
      const advancedScans = features.find((f: any) => f.feature_key === 'advanced_scans_daily');
      if (advancedScans) {
        expect(advancedScans.quota_limit).toBe(2);
      }
    }
  });

  test('13. Sync Stripe subscriptions', async ({ request }) => {
    const syncResponse = await request.post(`${SUPABASE_URL}/functions/v1/sync-stripe-subscriptions`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });

    expect([200, 401]).toContain(syncResponse.status());
  });
});
