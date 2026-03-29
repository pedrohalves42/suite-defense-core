/**
 * log-domain-event - Trusted relayer for domain events
 * Migrated to servePublic middleware (no auth required for event logging)
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

servePublic(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  // Support both single event and array of events
  const events = Array.isArray(body) ? body : [body];

  if (events.length === 0) {
    return { success: true, inserted: 0 };
  }

  const { error } = await supabase.from('domain_events').insert(events);

  if (error) {
    logger.error(`[log-domain-event][${requestId}] Insert error:`, { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return { success: true, inserted: events.length };
}, { methods: ['POST'] });
