/**
 * notification-dispatcher — Consolidated notification function
 * Migrated to serveTenant middleware (supports both internal and JWT admin calls).
 *
 * Body: { channel, type, tenant_id, recipients?, subject?, message, severity?, metadata? }
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const NotificationSchema = z.object({
  channel: z.enum(['email', 'telegram', 'whatsapp', 'in_app']),
  type: z.string().min(1).max(100),
  tenant_id: z.string().uuid().optional(),
  recipients: z.array(z.string()).max(100).optional(),
  subject: z.string().max(500).optional(),
  message: z.string().min(1).max(5000),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  metadata: z.record(z.unknown()).optional(),
  agent_name: z.string().max(255).optional(),
});

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;
  const startedAt = Date.now();

  const parsed = NotificationSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { channel, type, message, severity, metadata = {}, subject, agent_name } = parsed.data;

  logger.info(`[notification-dispatcher][${requestId}] channel=${channel} type=${type} severity=${severity}`);

  // Store in-app notification
  if (channel === 'in_app') {
    const { error: insertErr } = await supabase
      .from('notifications')
      .insert({
        tenant_id: tenantId,
        title: subject || type,
        message,
        type: severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info',
        metadata: { ...metadata, notification_type: type, agent_name },
      });

    if (insertErr) {
      logger.error(`[notification-dispatcher][${requestId}] Insert error:`, insertErr.message);
      return new Response(
        JSON.stringify({ error: insertErr.message, requestId }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return { success: true, channel: 'in_app', requestId, duration_ms: Date.now() - startedAt };
  }

  // For external channels, look up tenant notification channels
  const { data: channels } = await supabase
    .from('notification_channels')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('channel_type', channel)
    .eq('is_active', true)
    .eq('is_verified', true);

  if (!channels || channels.length === 0) {
    logger.warn(`[notification-dispatcher][${requestId}] No active ${channel} channel for tenant ${tenantId}`);
    // Fallback to in-app
    await supabase.from('notifications').insert({
      tenant_id: tenantId,
      title: subject || type,
      message: `[${channel} unavailable] ${message}`,
      type: 'warning',
      metadata: { ...metadata, original_channel: channel, fallback: true },
    });

    return { success: true, channel: 'in_app', fallback: true, requestId };
  }

  // Dispatch to each configured channel
  const dispatched: string[] = [];
  const errors: string[] = [];

  for (const ch of channels) {
    try {
      if (channel === 'email') {
        logger.info(`[notification-dispatcher][${requestId}] Email dispatch to ${(ch.config as Record<string, unknown>)?.email || 'configured'}`);
        dispatched.push(ch.id);
      } else if (channel === 'telegram') {
        const config = ch.config as Record<string, unknown>;
        const chatId = config?.chat_id;
        const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || config?.bot_token;
        if (chatId && botToken) {
          const telegramRes = await fetchWithTimeout(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `[${severity.toUpperCase()}] ${body.subject || type}\n\n${message}`,
                parse_mode: 'HTML',
              }),
            },
          );
          await telegramRes.text();
          dispatched.push(ch.id);
        }
      } else if (channel === 'whatsapp') {
        logger.info(`[notification-dispatcher][${requestId}] WhatsApp dispatch to ${(ch.config as Record<string, unknown>)?.phone || 'configured'}`);
        dispatched.push(ch.id);
      }
    } catch (e) {
      errors.push(`${ch.id}: ${String(e)}`);
    }
  }

  // Log dispatch
  try {
    await supabase.from('notification_logs').insert({
      tenant_id: tenantId,
      channel_type: channel,
      notification_type: type,
      status: errors.length > 0 ? 'partial' : 'sent',
      metadata: { dispatched, errors, severity, requestId },
    });
  } catch (err) {
    console.warn('[notification-dispatcher] Failed to log notification (non-critical)', err);
  }

  return {
    success: true,
    channel,
    dispatched: dispatched.length,
    errors: errors.length,
    requestId,
    duration_ms: Date.now() - startedAt,
  };
}, {
  methods: ['POST'],
});
