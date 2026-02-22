import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate internal caller
    const internalSecret = Deno.env.get('INTERNAL_SECRET');
    const callerSecret = req.headers.get('x-internal-secret');
    
    if (internalSecret && callerSecret !== internalSecret) {
      console.warn('[dispatch-webhook] Unauthorized call attempt');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { tenant_id, alert_id, severity, title, message, metadata } = body;

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch active webhook channels for this tenant
    const { data: channels, error: channelsError } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('channel_type', 'webhook')
      .eq('is_active', true);

    if (channelsError) throw new Error(`Failed to fetch channels: ${channelsError.message}`);
    if (!channels || channels.length === 0) {
      console.log('[dispatch-webhook] No active webhook channels for tenant');
      return new Response(JSON.stringify({ dispatched: 0, message: 'No active webhook channels' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dispatched = 0;
    let failed = 0;

    for (const channel of channels) {
      const config = channel.config as { url?: string; headers?: Record<string, string>; secret?: string };
      if (!config?.url) continue;

      const payload = {
        event: 'security_alert',
        timestamp: new Date().toISOString(),
        alert_id,
        severity: severity || 'info',
        title: title || 'CyberShield Alert',
        message: message || '',
        metadata: metadata || {},
        source: 'cybershield',
      };

      // Add HMAC signature if secret configured
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CyberShield-Webhook/1.0',
        ...(config.headers || {}),
      };

      if (config.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(config.secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const payloadBytes = encoder.encode(JSON.stringify(payload));
        const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
        const hexSignature = Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        headers['X-Webhook-Signature'] = `sha256=${hexSignature}`;
      }

      try {
        const response = await fetch(config.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        // Log delivery
        await supabase
          .from('notification_deliveries')
          .insert({
            tenant_id,
            alert_id: alert_id || null,
            channel: 'webhook',
            recipient: config.url,
            subject: title || 'CyberShield Alert',
            message: message || '',
            status: response.ok ? 'delivered' : 'failed',
            delivered_at: response.ok ? new Date().toISOString() : null,
            error_message: response.ok ? null : `HTTP ${response.status}`,
          });

        if (response.ok) {
          dispatched++;
        } else {
          console.warn(`[dispatch-webhook] Channel ${channel.name}: HTTP ${response.status}`);
          failed++;
        }
      } catch (fetchError) {
        console.error(`[dispatch-webhook] Channel ${channel.name}: ${String(fetchError)}`);
        
        await supabase
          .from('notification_deliveries')
          .insert({
            tenant_id,
            alert_id: alert_id || null,
            channel: 'webhook',
            recipient: config.url,
            subject: title || 'CyberShield Alert',
            message: String(fetchError),
            status: 'failed',
            error_message: String(fetchError),
          });
        
        failed++;
      }
    }

    console.log(`[dispatch-webhook] Dispatched: ${dispatched}, Failed: ${failed}`);

    return new Response(JSON.stringify({ dispatched, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[dispatch-webhook] Fatal error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
