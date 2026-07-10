/**
 * P0-04 · Etapa 4 — Deno unit tests for `requireAAL2`.
 *
 * These tests use a fake Supabase client + synthetic JWTs (unsigned,
 * `getUser` stubbed) to exercise all branches of the helper. They do
 * NOT depend on network, environment variables, or a live Supabase
 * project — this is a pure logic test of the enforcement contract.
 *
 * Cases covered:
 *   1. AAL1 JWT + `X-Step-Up-Verified: true`     → 403 STEP_UP_REQUIRED
 *   2. AAL2, MFA age = 120s                       → ok
 *   3. AAL2, MFA age = 301s                       → 403 STEP_UP_EXPIRED
 *   4. Bearer inválido (getUser falha)            → 401 INVALID_TOKEN
 *   5. Sem Authorization                          → 401 AUTH_REQUIRED
 *   6. AAL2 válido + tenant não resolvido         → 403 TENANT_UNRESOLVED
 *   7. AAL2 sem factor MFA em amr                 → 403 STEP_UP_REQUIRED
 */

import {
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { requireAAL2 } from './require-aal2.ts';

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

interface FakeJwtOpts {
  aal?: 'aal1' | 'aal2';
  amr?: Array<{ method?: string; timestamp?: number }>;
  sub?: string;
}

function makeJwt(opts: FakeJwtOpts = {}): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: opts.sub ?? 'user-123',
      aal: opts.aal ?? 'aal1',
      amr: opts.amr ?? [],
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  // signature not validated in this test (we stub getUser)
  return `${header}.${payload}.sig`;
}

interface FakeClientOpts {
  getUserOk?: boolean;
  tenantId?: string | null;
  userId?: string;
}

function makeFakeSupabase(opts: FakeClientOpts = {}): any {
  const userId = opts.userId ?? 'user-123';
  const tenantId = opts.tenantId === undefined ? 'tenant-abc' : opts.tenantId;
  const getUserOk = opts.getUserOk !== false;

  return {
    auth: {
      // deno-lint-ignore require-await
      async getUser(_jwt: string) {
        if (!getUserOk) {
          return { data: { user: null }, error: { message: 'invalid jwt' } };
        }
        return { data: { user: { id: userId } }, error: null };
      },
    },
    from(_table: string) {
      const chain: any = {
        select() { return chain; },
        eq() { return chain; },
        limit() { return chain; },
        // deno-lint-ignore require-await
        async maybeSingle() {
          if (tenantId === null) return { data: null, error: null };
          return { data: { tenant_id: tenantId }, error: null };
        },
      };
      return chain;
    },
  };
}

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/test', { method: 'POST', headers });
}

const nowSec = () => Math.floor(Date.now() / 1000);

// ------------------------------------------------------------------
// tests
// ------------------------------------------------------------------

Deno.test('caso 1 · AAL1 + X-Step-Up-Verified header → 403 STEP_UP_REQUIRED (bypass morto)', async () => {
  const jwt = makeJwt({
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: nowSec() }],
  });
  const req = makeReq({
    Authorization: `Bearer ${jwt}`,
    'X-Step-Up-Verified': 'true',
  });
  const res = await requireAAL2({ req, supabase: makeFakeSupabase() });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 403);
    assertEquals(res.code, 'STEP_UP_REQUIRED');
  }
});

Deno.test('caso 2 · AAL2 com idade = 120s → ok', async () => {
  const jwt = makeJwt({
    aal: 'aal2',
    amr: [
      { method: 'password', timestamp: nowSec() - 300 },
      { method: 'totp', timestamp: nowSec() - 120 },
    ],
  });
  const req = makeReq({ Authorization: `Bearer ${jwt}` });
  const res = await requireAAL2({ req, supabase: makeFakeSupabase() });
  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.aal, 'aal2');
    assertEquals(res.tenantId, 'tenant-abc');
    // tolerate ±2s clock drift
    if (res.stepUpAgeSeconds < 118 || res.stepUpAgeSeconds > 122) {
      throw new Error(`unexpected age: ${res.stepUpAgeSeconds}`);
    }
  }
});

Deno.test('caso 3 · AAL2 com idade = 301s → 403 STEP_UP_EXPIRED', async () => {
  const jwt = makeJwt({
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: nowSec() - 301 }],
  });
  const req = makeReq({ Authorization: `Bearer ${jwt}` });
  const res = await requireAAL2({ req, supabase: makeFakeSupabase() });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 403);
    assertEquals(res.code, 'STEP_UP_EXPIRED');
  }
});

Deno.test('caso 4 · Bearer inválido (getUser falha) → 401 INVALID_TOKEN', async () => {
  const req = makeReq({ Authorization: 'Bearer not-a-real-jwt' });
  const res = await requireAAL2({
    req,
    supabase: makeFakeSupabase({ getUserOk: false }),
  });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 401);
    assertEquals(res.code, 'INVALID_TOKEN');
  }
});

Deno.test('caso 5 · sem Authorization header → 401 AUTH_REQUIRED', async () => {
  const req = makeReq({});
  const res = await requireAAL2({ req, supabase: makeFakeSupabase() });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 401);
    assertEquals(res.code, 'AUTH_REQUIRED');
  }
});

Deno.test('caso 5b · Authorization sem prefixo Bearer → 401 AUTH_REQUIRED', async () => {
  const req = makeReq({ Authorization: 'Token abc' });
  const res = await requireAAL2({ req, supabase: makeFakeSupabase() });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.code, 'AUTH_REQUIRED');
  }
});

Deno.test('caso 6 · AAL2 válido + tenant não resolvido → 403 TENANT_UNRESOLVED', async () => {
  const jwt = makeJwt({
    aal: 'aal2',
    amr: [{ method: 'webauthn', timestamp: nowSec() - 10 }],
  });
  const req = makeReq({ Authorization: `Bearer ${jwt}` });
  const res = await requireAAL2({
    req,
    supabase: makeFakeSupabase({ tenantId: null }),
  });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 403);
    assertEquals(res.code, 'TENANT_UNRESOLVED');
  }
});

Deno.test('caso 7 · AAL2 mas sem factor MFA em amr → 403 STEP_UP_REQUIRED', async () => {
  const jwt = makeJwt({
    aal: 'aal2',
    amr: [{ method: 'password', timestamp: nowSec() }],
  });
  const req = makeReq({ Authorization: `Bearer ${jwt}` });
  const res = await requireAAL2({ req, supabase: makeFakeSupabase() });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 403);
    assertEquals(res.code, 'STEP_UP_REQUIRED');
  }
});
