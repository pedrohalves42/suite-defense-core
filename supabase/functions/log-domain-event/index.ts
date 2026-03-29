import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();

    // Support both single event and array of events
    const events = Array.isArray(body) ? body : [body];

    if (events.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0 }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("domain_events").insert(events);

    if (error) {
      logger.error("[log-domain-event] Insert error:", { error: error.message });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, inserted: events.length }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[log-domain-event] Error:", { error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
