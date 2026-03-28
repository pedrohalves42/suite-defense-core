/**
 * send-notification - DEPRECATED REDIRECT (COST-OPT v9)
 * Migrated to assertInternalCaller
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { channel, recipient, subject, message, alert_id, tenant_id } = await req.json();

    if (!channel || !recipient || !message) {
      return new Response(
        JSON.stringify({ error: 'channel, recipient, and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';
    const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
      headers: { 'X-Internal-Secret': internalSecret },
      body: {
        channel: channel === 'slack' ? 'in_app' : channel,
        type: 'alert', tenant_id: tenant_id || '', subject, message,
        severity: 'info',
        metadata: { alert_id, recipient, original_channel: channel, requestId },
      },
    });

    await supabase.from('notification_deliveries').insert({
      tenant_id: tenant_id || null, alert_id: alert_id || null,
      channel, recipient, subject, message,
      status: error ? 'failed' : 'delivered',
      delivered_at: error ? null : new Date().toISOString(),
      error_message: error ? error.message : null,
    });

    return new Response(
      JSON.stringify({ success: !error, channel, recipient, redirected_to: 'notification-dispatcher' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error), requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
