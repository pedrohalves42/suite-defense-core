/**
 * dispatch-notification — DEPRECATED REDIRECT (COST-OPT v9)
 * 
 * Now redirects all calls to notification-dispatcher.
 * Kept for backward compatibility with existing callers.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');
  const authHeader = req.headers.get('Authorization');

  const isInternalAuth = INTERNAL_SECRET && providedSecret === INTERNAL_SECRET;
  const isJwtAuth = authHeader?.startsWith('Bearer ') && authHeader.length > 10;

  if (!isInternalAuth && !isJwtAuth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();

    // Map old dispatch-notification format → notification-dispatcher format
    const channelTypeMap: Record<string, string> = {
      whatsapp: 'whatsapp',
      telegram: 'telegram',
      email: 'email',
      sms: 'in_app', // SMS not supported, fallback to in_app
    };

    // Fetch active channels for tenant
    const { data: channels } = await supabase
      .from('notification_channels')
      .select('id, channel_type, config, name')
      .eq('tenant_id', payload.tenant_id)
      .eq('is_active', true)
      .eq('is_verified', true);

    if (!channels || channels.length === 0) {
      // Fallback: store as in_app notification via notification-dispatcher
      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET || '' },
        body: {
          channel: 'in_app',
          type: payload.alert_type || 'system',
          tenant_id: payload.tenant_id,
          subject: payload.title,
          message: payload.message,
          severity: payload.severity || 'info',
          metadata: payload.details,
          agent_name: payload.agent_name,
        },
      });

      return new Response(JSON.stringify({
        success: true,
        notifications_sent: error ? 0 : 1,
        redirected_to: 'notification-dispatcher',
        fallback: 'in_app',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Dispatch to notification-dispatcher for each channel type
    const results: Array<{ channel: string; status: string }> = [];
    const uniqueTypes = [...new Set(channels.map(c => c.channel_type))];

    for (const channelType of uniqueTypes) {
      const mapped = channelTypeMap[channelType] || 'in_app';
      const { error } = await supabase.functions.invoke('notification-dispatcher', {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET || '' },
        body: {
          channel: mapped,
          type: payload.alert_type || 'system',
          tenant_id: payload.tenant_id,
          subject: payload.title,
          message: payload.message,
          severity: payload.severity || 'info',
          metadata: payload.details,
          agent_name: payload.agent_name,
        },
      });
      results.push({ channel: channelType, status: error ? 'failed' : 'sent' });
    }

    return new Response(JSON.stringify({
      success: true,
      notifications_sent: results.filter(r => r.status === 'sent').length,
      redirected_to: 'notification-dispatcher',
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    logger.error('[dispatch-notification] Fatal error', { error: String(error) });
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
