/**
 * wrappers.equivalence.test.ts — R4 Wave 1
 *
 * Contract: with no stages other than `business`, composePipeline MUST be
 * observationally equivalent to invoking the business function directly.
 *
 * The 5 wrappers (serveTenant, servePublic, serveInternal, serveAgent,
 * serveHoneypot) all wire the handler+response-serialization block as
 * `business` and call `composePipeline({ business })(req)`. If this identity
 * property holds, none of them changes behavior in Wave 1.
 *
 * Coverage:
 *   - equivalência de headers
 *   - equivalência de status codes
 *   - equivalência de corpo de resposta
 *   - equivalência do fluxo de erros
 *   - equivalência de timeouts (propagados como exceção)
 *   - equivalência de logs (business chamada exatamente 1x)
 *   - equivalência da resposta de validação de tenant (early-return 4xx)
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { composePipeline } from '../pipeline.ts';

function makeReq(): Request {
  return new Request('https://example.test/x', { method: 'POST', body: '{}' });
}

async function readAll(res: Response): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  const body = await res.text();
  return { status: res.status, headers, body };
}

Deno.test('equivalence: status code preserved', async () => {
  const business = async (_r: Request) =>
    new Response('ok', { status: 201 });

  const direct = await business(makeReq());
  const piped = await composePipeline({ business })(makeReq());

  assertEquals(piped.status, direct.status);
  assertEquals(piped.status, 201);
});

Deno.test('equivalence: response body preserved byte-for-byte', async () => {
  const payload = JSON.stringify({ ok: true, n: 42, s: 'á é í' });
  const business = async (_r: Request) =>
    new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } });

  const direct = await readAll(await business(makeReq()));
  const piped = await readAll(await composePipeline({ business })(makeReq()));

  assertEquals(piped.body, direct.body);
  assertEquals(piped.body, payload);
});

Deno.test('equivalence: all headers preserved (incl. X-Request-ID, security)', async () => {
  const business = async (_r: Request) =>
    new Response('{}', {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': 'req-abc-123',
        'X-Trace-ID': 'req-abc-123',
        'X-Response-Time': '17ms',
        'Strict-Transport-Security': 'max-age=63072000',
      },
    });

  const direct = await readAll(await business(makeReq()));
  const piped = await readAll(await composePipeline({ business })(makeReq()));

  assertEquals(piped.headers, direct.headers);
});

Deno.test('equivalence: error thrown by business propagates unchanged', async () => {
  const err = new Error('boom-from-handler');
  const business = async (_r: Request): Promise<Response> => { throw err; };

  await assertRejects(() => business(makeReq()), Error, 'boom-from-handler');
  await assertRejects(
    () => composePipeline({ business })(makeReq()),
    Error,
    'boom-from-handler',
  );
});

Deno.test('equivalence: timeout-style rejection propagates unchanged', async () => {
  // Simulates withTimeout throwing "Handler timeout after Nms" inside business.
  const business = async (_r: Request): Promise<Response> => {
    throw new Error('Handler timeout after 25000ms');
  };

  await assertRejects(
    () => composePipeline({ business })(makeReq()),
    Error,
    'Handler timeout',
  );
});

Deno.test('equivalence: business invoked exactly once (no retries by default)', async () => {
  let calls = 0;
  const business = async (_r: Request) => {
    calls++;
    return new Response('{}', { status: 200 });
  };

  await composePipeline({ business })(makeReq());
  assertEquals(calls, 1);
});

Deno.test('equivalence: tenant-validation-style early return (4xx) preserved', async () => {
  // Wrappers return errorResponse(403, ...) for unauthorized tenant. The
  // business fn simply returns that Response; pipeline must not alter it.
  const forbidden = new Response(
    JSON.stringify({ error: { message: 'Access denied: unauthorized tenant', code: 'FORBIDDEN' } }),
    { status: 403, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req-1' } },
  );
  const business = async (_r: Request) => forbidden.clone();

  const piped = await readAll(await composePipeline({ business })(makeReq()));
  assertEquals(piped.status, 403);
  assertEquals(JSON.parse(piped.body).error.code, 'FORBIDDEN');
  assertEquals(piped.headers['x-request-id'] ?? piped.headers['X-Request-ID'], 'req-1');
});

Deno.test('equivalence: request instance passed to business is the original', async () => {
  const req = makeReq();
  let seen: Request | null = null;
  const business = async (r: Request) => {
    seen = r;
    return new Response('{}', { status: 200 });
  };

  await composePipeline({ business })(req);
  assertEquals(seen, req);
});
