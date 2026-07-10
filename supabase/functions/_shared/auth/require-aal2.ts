/**
 * P0-04 · Step-up Authentication Enforcement (server-side)
 *
 * Single source of truth for AAL2 / step-up validation on destructive
 * endpoints. Replaces the header-based bypass (`X-Step-Up-Verified`)
 * that existed in `api-gateway/handlers/honeypot.ts`.
 *
 * Contract:
 *   - Extracts `Authorization: Bearer <jwt>` from the request.
 *   - Validates the JWT via `supabase.auth.getUser(jwt)` (signature + expiry).
 *   - Requires `aal === 'aal2'` in the JWT payload.
 *   - Requires at least one MFA factor in `amr` (`totp`, `webauthn`, `sms`,
 *     `phone`) with a `timestamp` within `stepUpMaxAgeSeconds` (ADR-008,
 *     default 300 s).
 *   - Resolves `tenantId` via `getTenantIdForUser`.
 *
 * Any endpoint that mutates sensitive state MUST call `requireAAL2(ctx)`
 * and reject on `!ok`. Direct reads of `X-Step-Up-Verified`, `aal` or
 * `amr` from handlers are forbidden by contract (P0-04 closure criteria).
 */

import { getTenantIdForUser } from '../tenant.ts';
import { logger } from '../logger.ts';

export const DEFAULT_STEP_UP_MAX_AGE_SECONDS = 300;

const MFA_METHODS = new Set([
  'totp',
  'webauthn',
  'sms',
  'phone',
  'mfa/totp',
  'mfa/webauthn',
  'mfa/sms',
  'mfa/phone',
]);

export type RequireAAL2Ok = {
  ok: true;
  userId: string;
  tenantId: string;
  aal: 'aal2';
  stepUpAgeSeconds: number;
};

export type RequireAAL2Err = {
  ok: false;
  status: number;
  error: string;
  code:
    | 'AUTH_REQUIRED'
    | 'INVALID_TOKEN'
    | 'STEP_UP_REQUIRED'
    | 'STEP_UP_EXPIRED'
    | 'TENANT_UNRESOLVED';
};

export type RequireAAL2Result = RequireAAL2Ok | RequireAAL2Err;

export interface RequireAAL2Ctx {
  req: Request;
  supabase: any; // SupabaseClient (service role or authed) — used for auth.getUser + tenant lookup
  stepUpMaxAgeSeconds?: number;
}

interface JwtPayload {
  sub?: string;
  aal?: string;
  amr?: Array<{ method?: string; timestamp?: number }>;
  exp?: number;
}

function decodeJwtPayload(jwt: string): JwtPayload | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const json = atob(b64);
    return JSON.parse(json) as JwtPayload;
  } catch (_err) {
    return null;
  }
}

export async function requireAAL2(ctx: RequireAAL2Ctx): Promise<RequireAAL2Result> {
  const maxAge = ctx.stepUpMaxAgeSeconds ?? DEFAULT_STEP_UP_MAX_AGE_SECONDS;

  const authHeader = ctx.req.headers.get('Authorization') || ctx.req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Authentication required', code: 'AUTH_REQUIRED' };
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) {
    return { ok: false, status: 401, error: 'Authentication required', code: 'AUTH_REQUIRED' };
  }

  // 1. Validate signature/expiry via Supabase
  const { data: userData, error: userErr } = await ctx.supabase.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: 'Invalid or expired token', code: 'INVALID_TOKEN' };
  }
  const userId = userData.user.id as string;

  // 2. Decode payload for aal + amr (not exposed by getUser())
  const payload = decodeJwtPayload(jwt);
  if (!payload) {
    return { ok: false, status: 401, error: 'Invalid token payload', code: 'INVALID_TOKEN' };
  }

  if (payload.aal !== 'aal2') {
    return {
      ok: false,
      status: 403,
      error: 'Step-up authentication required (AAL2)',
      code: 'STEP_UP_REQUIRED',
    };
  }

  // 3. Locate most recent MFA factor in amr and check recency
  const amr = Array.isArray(payload.amr) ? payload.amr : [];
  let latestMfaTs = 0;
  for (const entry of amr) {
    if (entry && typeof entry.method === 'string' && MFA_METHODS.has(entry.method)) {
      const ts = typeof entry.timestamp === 'number' ? entry.timestamp : 0;
      if (ts > latestMfaTs) latestMfaTs = ts;
    }
  }

  if (latestMfaTs === 0) {
    return {
      ok: false,
      status: 403,
      error: 'Step-up authentication required (MFA factor missing in amr)',
      code: 'STEP_UP_REQUIRED',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - latestMfaTs;
  if (ageSec > maxAge) {
    return {
      ok: false,
      status: 403,
      error: `Step-up authentication expired (age ${ageSec}s > ${maxAge}s)`,
      code: 'STEP_UP_EXPIRED',
    };
  }

  // 4. Resolve tenant
  const tenantId = await getTenantIdForUser(ctx.supabase, userId);
  if (!tenantId) {
    logger.warn('[requireAAL2] tenant unresolved', { userId });
    return {
      ok: false,
      status: 403,
      error: 'Tenant context could not be resolved for user',
      code: 'TENANT_UNRESOLVED',
    };
  }

  return {
    ok: true,
    userId,
    tenantId,
    aal: 'aal2',
    stepUpAgeSeconds: ageSec,
  };
}
