/**
 * serve-installer — STUB (redirects to public-gateway)
 * Logic inlined into public-gateway Phase 7.
 * Kept as proxy for backward compatibility with existing enrollment URLs.
 */
import { servePublic } from '../_shared/serve-public.ts';

servePublic(async (req, ctx) => {
  const url = new URL(req.url);
  const enrollmentKey = url.pathname.split('/').pop() || '';
  const payload: Record<string, string> = {
    enrollmentKey,
    mode: url.searchParams.get('mode') || 'args',
  };
  const hostname = url.searchParams.get('hostname');
  const osType = url.searchParams.get('os_type');
  if (hostname) payload.hostname = hostname;
  if (osType) payload.os_type = osType;

  const gwUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/public-gateway`;
  const resp = await fetch(gwUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': ctx.requestId,
      'origin': req.headers.get('origin') || '',
      'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
      'x-real-ip': req.headers.get('x-real-ip') || '',
      'cf-connecting-ip': req.headers.get('cf-connecting-ip') || '',
      'user-agent': req.headers.get('user-agent') || '',
    },
    body: JSON.stringify({ action: 'public:serve-installer', payload }),
  });
  return resp;
});
