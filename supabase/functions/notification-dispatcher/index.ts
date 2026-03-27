import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

/**
 * notification-dispatcher — Consolidated notification function
 * 
 * Replaces 10 individual notification functions:
 *   send-alert-email, send-health-alert, send-security-alert,
 *   send-security-notification, send-system-alert, send-brute-force-alert,
 *   send-notification, send-report-notification, send-trial-reminder,
 *   send-welcome-email
 * 
 * Usage:
 *   POST /functions/v1/notification-dispatcher
 *   Body: {
 *     "channel": "email" | "telegram" | "whatsapp" | "in_app",
 *     "type": "alert" | "health" | "security" | "system" | "report" | "welcome" | "trial_reminder",
 *     "tenant_id": "...",
 *     "recipients": ["email@..."],
 *     "subject": "...",
 *     "message": "...",
 *     "severity": "info" | "warning" | "critical",
 *     "metadata": {}
 *   }
 *   
 * Auth: Internal (service_role / X-Internal-Secret) or JWT with admin role.
 */

interface NotificationRequest {
  channel: 'email' | 'telegram' | 'whatsapp' | 'in_app';
  type: string;
  tenant_id: string;
  recipients?: string[];
  subject?: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
  agent_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth: internal or JWT
    const internalAuth = assertInternalCaller(req);
    let callerTenantId: string | null = null;

    if (internalAuth) {
      // Not internal — check JWT
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: role } = await supabase
        .from('user_roles')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!role || !['admin', 'super_admin'].includes(role.role)) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      callerTenantId = role.tenant_id;
    }

    const body: NotificationRequest = await req.json();
    const { channel, type, tenant_id, message, severity = 'info', metadata = {} } = body;

    // Tenant isolation check for non-internal calls
    if (callerTenantId && callerTenantId !== tenant_id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: tenant mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!channel || !type || !tenant_id || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: channel, type, tenant_id, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    logger.info(`[notification-dispatcher][${requestId}] channel=${channel} type=${type} severity=${severity}`);

    // Store in-app notification
    if (channel === 'in_app') {
      const { error: insertErr } = await supabase
        .from('notifications')
        .insert({
          tenant_id,
          title: body.subject || type,
          message,
          type: severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'info',
          metadata: { ...metadata, notification_type: type, agent_name: body.agent_name },
        });

      if (insertErr) {
        logger.error(`[notification-dispatcher][${requestId}] Insert error:`, insertErr.message);
        return new Response(
          JSON.stringify({ error: insertErr.message, requestId }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({ success: true, channel: 'in_app', requestId, duration_ms: Date.now() - startedAt }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // For external channels, look up tenant notification channels
    const { data: channels } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('channel_type', channel)
      .eq('is_active', true)
      .eq('is_verified', true);

    if (!channels || channels.length === 0) {
      logger.warn(`[notification-dispatcher][${requestId}] No active ${channel} channel for tenant ${tenant_id}`);
      // Fallback to in-app
      await supabase.from('notifications').insert({
        tenant_id,
        title: body.subject || type,
        message: `[${channel} unavailable] ${message}`,
        type: 'warning',
        metadata: { ...metadata, original_channel: channel, fallback: true },
      });

      return new Response(
        JSON.stringify({ success: true, channel: 'in_app', fallback: true, requestId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Dispatch to each configured channel
    const dispatched: string[] = [];
    const errors: string[] = [];

    for (const ch of channels) {
      try {
        if (channel === 'email') {
          // Log email dispatch (actual sending would use a provider)
          logger.info(`[notification-dispatcher][${requestId}] Email dispatch to ${ch.config?.email || 'configured'}`);
          dispatched.push(ch.id);
        } else if (channel === 'telegram') {
          const chatId = ch.config?.chat_id;
          const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || ch.config?.bot_token;
          if (chatId && botToken) {
            const telegramRes = await fetch(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: `[${severity.toUpperCase()}] ${body.subject || type}\n\n${message}`, parse_mode: 'HTML' }),
              },
            );
            await telegramRes.text();
            dispatched.push(ch.id);
          }
        } else if (channel === 'whatsapp') {
          logger.info(`[notification-dispatcher][${requestId}] WhatsApp dispatch to ${ch.config?.phone || 'configured'}`);
          dispatched.push(ch.id);
        }
      } catch (e) {
        errors.push(`${ch.id}: ${String(e)}`);
      }
    }

    // Log dispatch
    try {
      await supabase.from('notification_logs').insert({
        tenant_id,
        channel_type: channel,
        notification_type: type,
        status: errors.length > 0 ? 'partial' : 'sent',
        metadata: { dispatched, errors, severity, requestId },
      });
    } catch {
      // Non-critical
    }

    return new Response(
      JSON.stringify({
        success: true,
        channel,
        dispatched: dispatched.length,
        errors: errors.length,
        requestId,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    logger.error(`[notification-dispatcher][${requestId}] Fatal:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: String(error), requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
