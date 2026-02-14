import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('X-Internal-Secret');
    if (!authHeader || authHeader !== internalSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { channel, recipient, subject, message, alert_id, tenant_id } = await req.json();

    if (!channel || !recipient || !message) {
      return new Response(
        JSON.stringify({ error: 'channel, recipient, and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[send-notification] Dispatching', { requestId, channel, recipient });

    let success = false;

    switch (channel) {
      case 'email':
        // Delegate to existing email function
        try {
          await supabase.functions.invoke('send-email-notification', {
            headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
            body: { to: recipient, subject: subject || 'CyberShield Alert', body: message },
          });
          success = true;
        } catch (e) {
          logger.error('[send-notification] Email failed', { error: (e as Error).message });
        }
        break;

      case 'telegram':
        try {
          await supabase.functions.invoke('send-telegram-notification', {
            headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
            body: { chat_id: recipient, message },
          });
          success = true;
        } catch (e) {
          logger.error('[send-notification] Telegram failed', { error: (e as Error).message });
        }
        break;

      case 'whatsapp':
        try {
          await supabase.functions.invoke('send-whatsapp-notification', {
            headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
            body: { phone: recipient, message },
          });
          success = true;
        } catch (e) {
          logger.error('[send-notification] WhatsApp failed', { error: (e as Error).message });
        }
        break;

      case 'slack':
        // Slack webhook
        const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
        if (slackWebhookUrl) {
          try {
            const resp = await fetch(slackWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: `*${subject || 'Alert'}*\n${message}`, channel: recipient }),
            });
            success = resp.ok;
          } catch (e) {
            logger.error('[send-notification] Slack failed', { error: (e as Error).message });
          }
        } else {
          logger.warn('[send-notification] SLACK_WEBHOOK_URL not configured');
        }
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unsupported channel: ${channel}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Record delivery
    const { data: delivery } = await supabase
      .from('notification_deliveries')
      .insert({
        tenant_id: tenant_id || null,
        alert_id: alert_id || null,
        channel,
        recipient,
        subject,
        message,
        status: success ? 'delivered' : 'failed',
        delivered_at: success ? new Date().toISOString() : null,
        error_message: success ? null : `${channel} delivery failed`,
      })
      .select('id')
      .single();

    return new Response(
      JSON.stringify({
        success,
        delivery_id: delivery?.id,
        channel,
        recipient,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'send-notification');
  }
});
