/**
 * Inlined webhook dispatch handler
 * Original: dispatch-webhook-notification/index.ts
 */
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export async function handleWebhook(
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
  requestId: string,
): Promise<Record<string, unknown>> {
  const { tenant_id, alert_id, severity, title, message, metadata } = payload as {
    tenant_id: string; alert_id?: string; severity?: string; title?: string;
    message?: string; metadata?: Record<string, unknown>;
  };

  if (!tenant_id) {
    return { error: 'tenant_id is required' };
  }

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
    logger.info(`[${requestId}] webhook: No active webhook destinations`);
    return { dispatched: 0, message: 'No active webhook destinations' };
  }

  let dispatched = 0;
  let failed = 0;

  for (const webhook of allWebhooks) {
    const webhookPayload = {
      event: 'security_alert', timestamp: new Date().toISOString(),
      alert_id, severity: severity || 'info', title: title || 'CyberShield Alert',
      message: message || '', metadata: metadata || {}, source: 'cybershield',
    };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'User-Agent': 'CyberShield-Webhook/1.0',
      ...(webhook.headers || {}),
    };

    if (webhook.secret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(webhook.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const payloadBytes = encoder.encode(JSON.stringify(webhookPayload));
      const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
      const hexSig = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
      headers['X-Webhook-Signature'] = `sha256=${hexSig}`;
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST', headers, body: JSON.stringify(webhookPayload),
        signal: AbortSignal.timeout(10000),
      });
      await supabase.from('notification_deliveries').insert({
        tenant_id, alert_id: alert_id || null, channel: 'webhook',
        recipient: webhook.url, subject: title || 'CyberShield Alert',
        message: message || '',
        status: response.ok ? 'delivered' : 'failed',
        delivered_at: response.ok ? new Date().toISOString() : null,
        error_message: response.ok ? null : `HTTP ${response.status}`,
      }).then(() => {});
      if (response.ok) dispatched++;
      else { logger.warn(`[${requestId}] webhook: ${webhook.name} HTTP ${response.status}`); failed++; }
    } catch (fetchError) {
      logger.error(`[${requestId}] webhook: ${webhook.name} ${String(fetchError)}`);
      await supabase.from('notification_deliveries').insert({
        tenant_id, alert_id: alert_id || null, channel: 'webhook',
        recipient: webhook.url, subject: title || 'CyberShield Alert',
        message: String(fetchError), status: 'failed', error_message: String(fetchError),
      }).then(() => {});
      failed++;
    }
  }

  logger.info(`[${requestId}] webhook: dispatched=${dispatched} failed=${failed}`);
  return { dispatched, failed };
}
