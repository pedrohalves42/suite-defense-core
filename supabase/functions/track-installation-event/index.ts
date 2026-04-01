import { servePublic } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { handleAgentTokenMode } from './agent-token-handler.ts';
import { handleAnonymousMode, handleJwtMode } from './jwt-handler.ts';

const InstallationEventSchema = z.object({
  agent_name: z.string().trim().min(1).max(100),
  event_type: z.enum(['generated', 'downloaded', 'command_copied', 'installed', 'failed', 'post_installation', 'post_installation_unverified', 'installation_failed']),
  platform: z.enum(['windows', 'linux', 'macos']),
  installation_method: z.enum(['download', 'one_click', 'manual']).optional(),
  installation_time_seconds: z.number().int().positive().max(86400).optional(),
  error_message: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

servePublic(async (req, ctx) => {
  const { supabase, requestId, body: rawBody } = ctx;
  const origin = req.headers.get('origin');

  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rateLimitResult = await checkRateLimit(supabase, clientIp, 'track-installation-event', { maxRequests: 60, windowMinutes: 1, blockMinutes: 5 });
  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({ ok: false, tracked: false, reason: 'rate_limit_exceeded', requestId, details: { message: 'Too many requests.', resetAt: rateLimitResult.resetAt?.toISOString() } }), {
      status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  // Validate
  const validation = InstallationEventSchema.safeParse(rawBody);
  if (!validation.success) {
    const issues = validation.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    return new Response(JSON.stringify({ ok: false, tracked: false, reason: 'invalid_payload', requestId, details: { issues } }), { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const event = validation.data;

  // Agent-token mode with HMAC
  const agentToken = req.headers.get('X-Agent-Token');
  const hmacSignature = req.headers.get('X-HMAC-Signature');

  if (agentToken && hmacSignature) {
    return await handleAgentTokenMode(req, supabase, event, agentToken, requestId, origin);
  }

  // Anonymous fallback (no auth)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return await handleAnonymousMode(req, supabase, event, requestId, origin);
  }

  // JWT mode
  const token = authHeader.replace('Bearer ', '');
  return await handleJwtMode(req, supabase, event, token, requestId, origin);
});
