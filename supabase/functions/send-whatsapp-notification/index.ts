import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppPayload {
  channel_id: string;
  tenant_id: string;
  alert_id?: string;
  recipient: string;
  config: {
    phone: string;
    provider?: 'twilio' | 'zapi';
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
    const payload: WhatsAppPayload = await req.json();
    logger.info('[send-whatsapp] Received request', { 
      channel_id: payload.channel_id,
      recipient: payload.recipient?.slice(0, 6) + '***' 
    });

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWhatsAppFrom = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

    if (!twilioAccountSid || !twilioAuthToken) {
      logger.warn('[send-whatsapp] Twilio credentials not configured');
      
      // Log the attempt even if not configured
      await supabase.from('notification_log').insert({
        tenant_id: payload.tenant_id,
        channel_id: payload.channel_id,
        alert_id: payload.alert_id,
        channel_type: 'whatsapp',
        recipient: payload.recipient,
        message_preview: payload.alert.title.slice(0, 100),
        status: 'failed',
        error_message: 'Twilio credentials not configured'
      });

      return new Response(JSON.stringify({ 
        success: false, 
        error: 'WhatsApp (Twilio) not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format message
    const emoji = SEVERITY_EMOJI[payload.alert.severity] || '[WARN] ?';
    const message = `${emoji} *CyberShield Alert*\n\n` +
      `*${payload.alert.title}*\n\n` +
      `${payload.alert.message}\n\n` +
      (payload.alert.agent_name ? `?? Agent: ${payload.alert.agent_name}\n` : '') +
      `? ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

    // Format phone number for WhatsApp
    const toNumber = payload.recipient.startsWith('whatsapp:') 
      ? payload.recipient 
      : `whatsapp:${payload.recipient.replace(/\D/g, '')}`;

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const formData = new URLSearchParams();
    formData.append('From', twilioWhatsAppFrom);
    formData.append('To', toNumber);
    formData.append('Body', message);

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error('[send-whatsapp] Twilio error', { status: response.status, error: result });
      
      await supabase.from('notification_log').insert({
        tenant_id: payload.tenant_id,
        channel_id: payload.channel_id,
        alert_id: payload.alert_id,
        channel_type: 'whatsapp',
        recipient: payload.recipient,
        message_preview: payload.alert.title.slice(0, 100),
        status: 'failed',
        error_message: result.message || 'Twilio API error'
      });

      return new Response(JSON.stringify({ 
        success: false, 
        error: result.message || 'Failed to send WhatsApp message' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('[send-whatsapp] Message sent successfully', { 
      sid: result.sid,
      to: toNumber.slice(0, 10) + '***'
    });

    // Log success
    await supabase.from('notification_log').insert({
      tenant_id: payload.tenant_id,
      channel_id: payload.channel_id,
      alert_id: payload.alert_id,
      channel_type: 'whatsapp',
      recipient: payload.recipient,
      message_preview: payload.alert.title.slice(0, 100),
      status: 'sent',
      external_id: result.sid,
      sent_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message_sid: result.sid 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[send-whatsapp] Fatal error', { error: errorMsg });
    
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
