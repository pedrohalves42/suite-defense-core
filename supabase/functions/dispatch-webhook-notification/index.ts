/**
 * Dispatch Webhook Notification - Migrated to assertInternalCaller
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const WebhookSchema = z.object({
  tenant_id: z.string().uuid(),
  alert_id: z.string().optional(),
  severity: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  try {
    const parsed = WebhookSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { tenant_id, alert_id, severity, title, message, metadata } = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: webhookConfigs } = await supabase
      .from('webhook_configs')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .or(`event_types.cs.{${severity === 'critical' ? 'critical_alert' : 'security_alert'}},event_types.cs.{security_alert}`);

    const { data: channels } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('channel_type', 'webhook')
      .eq('is_active', true);

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
      logger.info('[dispatch-webhook] No active webhook destinations for tenant');
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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CyberShield-Webhook/1.0',
        ...(webhook.headers || {}),
      };

      if (webhook.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(webhook.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const payloadBytes = encoder.encode(JSON.stringify(payload));
        const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
        const hexSignature = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
        headers['X-Webhook-Signature'] = `sha256=${hexSignature}`;
      }

      try {
        const response = await fetch(webhook.url, {
          method: 'POST', headers, body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        await supabase.from('notification_deliveries').insert({
          tenant_id, alert_id: alert_id || null, channel: 'webhook',
          recipient: webhook.url, subject: title || 'CyberShield Alert',
          message: message || '',
          status: response.ok ? 'delivered' : 'failed',
          delivered_at: response.ok ? new Date().toISOString() : null,
          error_message: response.ok ? null : `HTTP ${response.status}`,
        });

        if (response.ok) dispatched++;
        else { logger.warn(`[dispatch-webhook] ${webhook.name}: HTTP ${response.status}`); failed++; }
      } catch (fetchError) {
        logger.error(`[dispatch-webhook] ${webhook.name}: ${String(fetchError)}`);
        await supabase.from('notification_deliveries').insert({
          tenant_id, alert_id: alert_id || null, channel: 'webhook',
          recipient: webhook.url, subject: title || 'CyberShield Alert',
          message: String(fetchError), status: 'failed', error_message: String(fetchError),
        });
        failed++;
      }
    }

    logger.info(`[dispatch-webhook] Dispatched: ${dispatched}, Failed: ${failed}`);
    return new Response(JSON.stringify({ dispatched, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('[dispatch-webhook] Fatal error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
