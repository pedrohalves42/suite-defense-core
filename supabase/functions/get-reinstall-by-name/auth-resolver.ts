/**
 * Authentication resolver for get-reinstall-by-name
 * Supports enrollment key and JWT auth modes
 * Extraído de get-reinstall-by-name/index.ts
 */
import { hashToken } from '../_shared/token-hash.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

interface AuthResult {
  tenantId: string | null;
  response?: Response;
}

function sanitizeEnrollmentKey(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/^Bearer\s+/i, '').replace(/^['"]+|['"]+$/g, '').trim();
}

/**
 * Resolves tenant from enrollment key or JWT.
 * Returns tenantId on success or a Response on failure.
 */
export async function resolveAuth(
  req: Request,
  url: URL,
  adminClient: SupabaseClient,
  supabaseUrl: string,
  requestId: string,
  origin: string | null,
): Promise<AuthResult> {
  const enrollmentKeyFromQuery = sanitizeEnrollmentKey(url.searchParams.get('key'));
  const enrollmentKeyFromHeader = sanitizeEnrollmentKey(req.headers.get('X-Enrollment-Key'));
  let enrollmentKeyFromBody: string | null = null;

  if (!enrollmentKeyFromQuery && !enrollmentKeyFromHeader && req.method === 'POST') {
    try {
      const body = await req.json();
      if (body && typeof body.enrollment_key === 'string') {
        enrollmentKeyFromBody = sanitizeEnrollmentKey(body.enrollment_key);
      }
    } catch { /* ignore */ }
  }

  const enrollmentKey = enrollmentKeyFromHeader || enrollmentKeyFromQuery || enrollmentKeyFromBody;
  const authHeader = req.headers.get('Authorization');

  if (enrollmentKey) {
    const keyHash = await hashToken(enrollmentKey);
    const { data: ek, error: ekError } = await adminClient
      .from('enrollment_keys')
      .select('id, tenant_id, is_active, expires_at, max_uses, current_uses')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .maybeSingle();

    if (ekError || !ek) {
      return { tenantId: null, response: new Response('# ERROR: Invalid or expired enrollment key\nWrite-Host "ERROR: Invalid key" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }
    if (ek.expires_at && new Date(ek.expires_at) < new Date()) {
      return { tenantId: null, response: new Response('# ERROR: Enrollment key has expired\nWrite-Host "ERROR: Key expired" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }
    if (ek.max_uses && ek.current_uses >= ek.max_uses) {
      return { tenantId: null, response: new Response('# ERROR: Enrollment key usage limit reached\nWrite-Host "ERROR: Key usage limit reached" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }

    await adminClient.from('enrollment_keys').update({ current_uses: ek.current_uses + 1 }).eq('id', ek.id);
    return { tenantId: ek.tenant_id };

  } else if (authHeader) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return { tenantId: null, response: new Response('# ERROR: Invalid JWT token\nWrite-Host "ERROR: Auth failed" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }
    const { data: role } = await adminClient.from('user_roles').select('tenant_id').eq('user_id', user.id).maybeSingle();
    return { tenantId: role?.tenant_id || null };

  } else {
    return {
      tenantId: null,
      response: new Response('# ERROR: Authentication required\n# Provide ?key=YOUR_ENROLLMENT_KEY\nWrite-Host "ERROR: No auth provided" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }),
    };
  }
}
