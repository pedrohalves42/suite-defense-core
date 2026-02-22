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

    // Fetch active webhook configs for this tenant (primary source)
    const { data: webhookConfigs } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .or(`event_types.cs.{${severity === 'critical' ? 'critical_alert' : 'security_alert'}},event_types.cs.{security_alert}`);

    // Fallback: also check notification_channels for backward compatibility
    const { data: channels } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('channel_type', 'webhook')
      .eq('is_active', true);

    // Merge both sources
    const allWebhooks: Array<{ name: string; url: string; secret?: string; headers?: Record<string, string> }> = [];
    
    for (const wc of webhookConfigs || []) {
      allWebhooks.push({ name: wc.name, url: wc.url, secret: wc.secret, headers: wc.headers as Record<string, string> });
    }
    for (const ch of channels || []) {
      const config = ch.config as { url?: string; headers?: Record<string, string>; secret?: string };
      if (config?.url) {
        allWebhooks.push({ name: ch.name, url: config.url, secret: config.secret, headers: config.headers });
      }
    }

    if (allWebhooks.length === 0) {
      console.log('[dispatch-webhook] No active webhook destinations for tenant');
      return new Response(JSON.stringify({ dispatched: 0, message: 'No active webhook destinations' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let dispatched = 0;
    let failed = 0;

    for (const webhook of allWebhooks) {
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
        ...(webhook.headers || {}),
      };

      if (webhook.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(webhook.secret),
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
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        await supabase
          .from('notification_deliveries')
          .insert({
            tenant_id,
            alert_id: alert_id || null,
            channel: 'webhook',
            recipient: webhook.url,
            subject: title || 'CyberShield Alert',
            message: message || '',
            status: response.ok ? 'delivered' : 'failed',
            delivered_at: response.ok ? new Date().toISOString() : null,
            error_message: response.ok ? null : `HTTP ${response.status}`,
          });

        if (response.ok) {
          dispatched++;
        } else {
          console.warn(`[dispatch-webhook] ${webhook.name}: HTTP ${response.status}`);
          failed++;
        }
      } catch (fetchError) {
        console.error(`[dispatch-webhook] ${webhook.name}: ${String(fetchError)}`);
        
        await supabase
          .from('notification_deliveries')
          .insert({
            tenant_id,
            alert_id: alert_id || null,
            channel: 'webhook',
            recipient: webhook.url,
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
