/**
 * Inlined telegram notification handler
 * Original: send-telegram-notification/index.ts
 */
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '🔵',
};
const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRITICO', high: 'ALTO', medium: 'MEDIO', low: 'BAIXO', info: 'INFO',
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function handleTelegram(
  payload: Record<string, unknown>,
  supabase: SupabaseClient,
  requestId: string,
): Promise<Record<string, unknown>> {
  const { channel_id, tenant_id, alert_id, recipient, config, alert } = payload as {
    channel_id?: string; tenant_id?: string; alert_id?: string; recipient?: string;
    config?: { chat_id?: string; bot_token?: string };
    alert?: { type?: string; severity?: string; title?: string; message?: string; details?: Record<string, unknown>; agent_name?: string };
  };

  const botToken = config?.bot_token || Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    logger.warn(`[${requestId}] telegram: bot token not configured`);
    await supabase.from('notification_log').insert({
      tenant_id, channel_id, alert_id, channel_type: 'telegram',
      recipient, message_preview: alert?.title?.slice(0, 100),
      status: 'failed', error_message: 'Telegram bot token not configured',
    }).then(() => {});
    return { success: false, error: 'Telegram bot not configured' };
  }

  const severity = alert?.severity?.toLowerCase() || 'info';
  const emoji = SEVERITY_EMOJI[severity] || '🔔';
  const label = SEVERITY_LABEL[severity] || 'ALERTA';
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const agentName = alert?.agent_name || 'System';
  const title = alert?.title || 'Alert';
  const msg = alert?.message || '';

  const text = [
    `${emoji} <b>CyberShield Alert</b>  ·  <code>${label}</code>`,
    ``, `━━━━━━━━━━━━━━━━━━`, ``,
    `<b>${escapeHtml(title)}</b>`, ``,
    `${escapeHtml(msg)}`, ``,
    `━━━━━━━━━━━━━━━━━━`, ``,
    `🖥 <b>Agent:</b> <code>${escapeHtml(agentName)}</code>`,
    `📅 <b>Data:</b> ${now}`,
  ].join('\n');

  const chatId = recipient || config?.chat_id;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const result = await response.json();

  if (!result.ok) {
    logger.error(`[${requestId}] telegram: API error`, { error: result.description });
    await supabase.from('notification_log').insert({
      tenant_id, channel_id, alert_id, channel_type: 'telegram',
      recipient: chatId, message_preview: title.slice(0, 100),
      status: 'failed', error_message: result.description || 'Telegram API error',
    }).then(() => {});
    return { success: false, error: result.description || 'Failed to send Telegram message' };
  }

  logger.info(`[${requestId}] telegram: sent to ${chatId}`);
  await supabase.from('notification_log').insert({
    tenant_id, channel_id, alert_id, channel_type: 'telegram',
    recipient: chatId, message_preview: title.slice(0, 100),
    status: 'sent', external_id: String(result.result?.message_id), sent_at: new Date().toISOString(),
  }).then(() => {});

  return { success: true, message_id: result.result?.message_id };
}
