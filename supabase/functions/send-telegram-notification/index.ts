import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramPayload {
  channel_id: string;
  tenant_id: string;
  alert_id?: string;
  recipient: string; // chat_id
  config: {
    chat_id: string;
    bot_token?: string;
  };
  alert: {
    type: string;
    severity: string;
    title: string;
    message: string;
    details?: Record<string, unknown>;
    agent_name?: string;
  };
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '?',
  high: '?',
  medium: '?',
  low: '?',
  info: '[INFO] ?'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const payload: TelegramPayload = await req.json();
    logger.info('[send-telegram] Received request', { 
      channel_id: payload.channel_id,
      chat_id: payload.recipient 
    });

    // Use channel-specific bot token or global one
    const botToken = payload.config.bot_token || Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      logger.warn('[send-telegram] Bot token not configured');
      
      await supabase.from('notification_log').insert({
        tenant_id: payload.tenant_id,
        channel_id: payload.channel_id,
        alert_id: payload.alert_id,
        channel_type: 'telegram',
        recipient: payload.recipient,
        message_preview: payload.alert.title.slice(0, 100),
        status: 'failed',
        error_message: 'Telegram bot token not configured'
      });

      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Telegram bot not configured. Please set TELEGRAM_BOT_TOKEN or configure in channel.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format message with Markdown
    const emoji = SEVERITY_EMOJI[payload.alert.severity] || '[WARN] ?';
    const message = `${emoji} *CyberShield Alert*\n\n` +
      `*${escapeMarkdown(payload.alert.title)}*\n\n` +
      `${escapeMarkdown(payload.alert.message)}\n\n` +
      (payload.alert.agent_name ? `?? Agent: \`${escapeMarkdown(payload.alert.agent_name)}\`\n` : '') +
      `? ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

    // Send via Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: payload.recipient,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      logger.error('[send-telegram] API error', { error: result.description });
      
      await supabase.from('notification_log').insert({
        tenant_id: payload.tenant_id,
        channel_id: payload.channel_id,
        alert_id: payload.alert_id,
        channel_type: 'telegram',
        recipient: payload.recipient,
        message_preview: payload.alert.title.slice(0, 100),
        status: 'failed',
        error_message: result.description || 'Telegram API error'
      });

      return new Response(JSON.stringify({ 
        success: false, 
        error: result.description || 'Failed to send Telegram message' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('[send-telegram] Message sent successfully', { 
      message_id: result.result?.message_id,
      chat_id: payload.recipient
    });

    // Log success
    await supabase.from('notification_log').insert({
      tenant_id: payload.tenant_id,
      channel_id: payload.channel_id,
      alert_id: payload.alert_id,
      channel_type: 'telegram',
      recipient: payload.recipient,
      message_preview: payload.alert.title.slice(0, 100),
      status: 'sent',
      external_id: String(result.result?.message_id),
      sent_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message_id: result.result?.message_id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[send-telegram] Fatal error', { error: errorMsg });
    
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Escape special Markdown characters
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
