/**
 * Inlined WhatsApp notification handler
 * Original: send-whatsapp-notification/index.ts
 */
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: 'ℹ️',
};

export async function handleWhatsApp(
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
  requestId: string,
): Promise<Record<string, unknown>> {
  const { channel_id, tenant_id, alert_id, recipient, config, alert } = payload as {
    channel_id?: string; tenant_id?: string; alert_id?: string; recipient?: string;
    config?: { phone?: string; provider?: string };
    alert?: { type?: string; severity?: string; title?: string; message?: string; agent_name?: string };
  };

  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioWhatsAppFrom = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';

  if (!twilioAccountSid || !twilioAuthToken) {
    logger.warn(`[${requestId}] whatsapp: Twilio credentials not configured`);
    await supabase.from('notification_log').insert({
      tenant_id, channel_id, alert_id, channel_type: 'whatsapp',
      recipient, message_preview: alert?.title?.slice(0, 100),
      status: 'failed', error_message: 'Twilio credentials not configured',
    }).then(() => {});
    return { success: false, error: 'WhatsApp (Twilio) not configured' };
  }

  const emoji = SEVERITY_EMOJI[alert?.severity || 'info'] || '⚠️';
  const message = `${emoji} *CyberShield Alert*\n\n*${alert?.title || 'Alert'}*\n\n${alert?.message || ''}\n\n` +
    (alert?.agent_name ? `🖥 Agent: ${alert.agent_name}\n` : '') +
    `📅 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

  const phone = recipient || config?.phone || '';
  const toNumber = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone.replace(/\D/g, '')}`;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
  const formData = new URLSearchParams();
  formData.append('From', twilioWhatsAppFrom);
  formData.append('To', toNumber);
  formData.append('Body', message);

  const response = await fetchWithTimeout(twilioUrl, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  const result = await response.json();

  if (!response.ok) {
    logger.error(`[${requestId}] whatsapp: Twilio error`, { status: response.status, error: result });
    await supabase.from('notification_log').insert({
      tenant_id, channel_id, alert_id, channel_type: 'whatsapp',
      recipient, message_preview: alert?.title?.slice(0, 100),
      status: 'failed', error_message: result.message || 'Twilio API error',
    }).then(() => {});
    return { success: false, error: result.message || 'Failed to send WhatsApp message' };
  }

  logger.info(`[${requestId}] whatsapp: sent to ${toNumber.slice(0, 10)}***`);
  await supabase.from('notification_log').insert({
    tenant_id, channel_id, alert_id, channel_type: 'whatsapp',
    recipient, message_preview: alert?.title?.slice(0, 100),
    status: 'sent', external_id: result.sid, sent_at: new Date().toISOString(),
  }).then(() => {});

  return { success: true, message_sid: result.sid };
}
