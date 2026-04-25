// @ts-nocheck
/**
 * Notify namespace inlined handlers (migrated from notification-router + standalone)
 * 
 * Direct handlers: email, telegram, whatsapp, webhook, welcome, security
 * Inlined from standalone: get-telegram-chat-id
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';

type SB = any;

// ── email ───────────────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = { critical: '#dc2626', high: '#ea580c', medium: '#ca8a04', low: '#16a34a', info: '#2563eb' };
const SEVERITY_LABELS: Record<string, string> = { critical: 'Critico', high: 'Alto', medium: 'Medio', low: 'Baixo', info: 'Informativo' };

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export async function handleNotifyEmail(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { channel_id, tenant_id, alert_id, recipient, config, alert } = payload as {
    channel_id?: string; tenant_id?: string; alert_id?: string; recipient?: string;
    config?: { email?: string }; alert?: { severity?: string; title?: string; message?: string; details?: Record<string, unknown>; agent_name?: string };
  };

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'email', recipient, message_preview: alert?.title?.slice(0, 100), status: 'failed', error_message: 'Resend API key not configured' }).then(() => {});
    return { success: false, error: 'Email service not configured' };
  }

  const { Resend } = await import('https://esm.sh/resend@2.0.0');
  const resend = new Resend(resendApiKey);
  const severity = alert?.severity || 'info';
  const title = alert?.title || 'CyberShield Alert';
  const message = alert?.message || '';
  const severityColor = SEVERITY_COLORS[severity] || '#6b7280';
  const severityLabel = SEVERITY_LABELS[severity] || severity;
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;padding:20px;"><tr><td style="background-color:#1f2937;padding:24px;border-radius:8px 8px 0 0;"><h1 style="color:#fff;margin:0;font-size:24px;">🛡️ CyberShield</h1></td></tr><tr><td style="background-color:#fff;padding:32px;border-radius:0 0 8px 8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="display:inline-block;padding:4px 12px;border-radius:9999px;background-color:${severityColor};color:white;font-size:12px;font-weight:600;text-transform:uppercase;margin-bottom:16px;">${severityLabel}</div><h2 style="color:#111827;margin:0 0 16px 0;font-size:20px;">${escapeHtml(title)}</h2><p style="color:#4b5563;margin:0 0 24px 0;font-size:16px;line-height:1.5;">${escapeHtml(message)}</p>${alert?.agent_name ? `<div style="background-color:#f9fafb;padding:16px;border-radius:8px;margin-bottom:24px;"><p style="color:#6b7280;margin:0;font-size:14px;"><strong>Computador:</strong> ${escapeHtml(alert.agent_name)}</p></div>` : ''}<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"><p style="color:#9ca3af;margin:0;font-size:12px;">Enviado em ${timestamp}</p></td></tr></table></body></html>`;

  const { data, error } = await resend.emails.send({ from: 'CyberShield <alertas@cybershield.com.br>', to: [recipient || config?.email || ''], subject: `[${severityLabel}] ${title}`, html: htmlContent });

  if (error) {
    await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'email', recipient, message_preview: title.slice(0, 100), status: 'failed', error_message: error.message }).then(() => {});
    return { success: false, error: error.message };
  }

  await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'email', recipient, message_preview: title.slice(0, 100), status: 'sent', external_id: data?.id, sent_at: new Date().toISOString() }).then(() => {});
  return { success: true, email_id: data?.id };
}

// ── telegram ────────────────────────────────────────────────────────────
const TG_EMOJI: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: '🔵' };
const TG_LABEL: Record<string, string> = { critical: 'CRITICO', high: 'ALTO', medium: 'MEDIO', low: 'BAIXO', info: 'INFO' };

export async function handleNotifyTelegram(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { channel_id, tenant_id, alert_id, recipient, config, alert } = payload as {
    channel_id?: string; tenant_id?: string; alert_id?: string; recipient?: string;
    config?: { chat_id?: string; bot_token?: string }; alert?: { severity?: string; title?: string; message?: string; agent_name?: string };
  };

  const botToken = config?.bot_token || Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'telegram', recipient, status: 'failed', error_message: 'Bot token not configured' }).then(() => {});
    return { success: false, error: 'Telegram bot not configured' };
  }

  const severity = alert?.severity?.toLowerCase() || 'info';
  const emoji = TG_EMOJI[severity] || '🔔';
  const label = TG_LABEL[severity] || 'ALERTA';
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const title = alert?.title || 'Alert';
  const text = `${emoji} <b>CyberShield Alert</b>  ·  <code>${label}</code>\n\n━━━━━━━━━━━━━━━━━━\n\n<b>${escapeHtml(title)}</b>\n\n${escapeHtml(alert?.message || '')}\n\n━━━━━━━━━━━━━━━━━━\n\n🖥 <b>Agent:</b> <code>${escapeHtml(alert?.agent_name || 'System')}</code>\n📅 <b>Data:</b> ${now}`;

  const chatId = recipient || config?.chat_id;
  const response = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }) });
  const result = await response.json();

  if (!result.ok) {
    await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'telegram', recipient: chatId, status: 'failed', error_message: result.description }).then(() => {});
    return { success: false, error: result.description };
  }

  await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'telegram', recipient: chatId, status: 'sent', external_id: String(result.result?.message_id), sent_at: new Date().toISOString() }).then(() => {});
  return { success: true, message_id: result.result?.message_id };
}

// ── whatsapp ────────────────────────────────────────────────────────────
export async function handleNotifyWhatsApp(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { channel_id, tenant_id, alert_id, recipient, config, alert } = payload as {
    channel_id?: string; tenant_id?: string; alert_id?: string; recipient?: string;
    config?: { phone?: string }; alert?: { severity?: string; title?: string; message?: string; agent_name?: string };
  };

  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!twilioAccountSid || !twilioAuthToken) {
    await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'whatsapp', recipient, status: 'failed', error_message: 'Twilio not configured' }).then(() => {});
    return { success: false, error: 'WhatsApp (Twilio) not configured' };
  }

  const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', info: 'ℹ️' }[alert?.severity || 'info'] || '⚠️';
  const message = `${emoji} *CyberShield Alert*\n\n*${alert?.title || 'Alert'}*\n\n${alert?.message || ''}\n\n${alert?.agent_name ? `🖥 Agent: ${alert.agent_name}\n` : ''}📅 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;

  const phone = recipient || config?.phone || '';
  const toNumber = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone.replace(/\D/g, '')}`;
  const twilioWhatsAppFrom = Deno.env.get('TWILIO_WHATSAPP_FROM') || 'whatsapp:+14155238886';
  const formData = new URLSearchParams(); formData.append('From', twilioWhatsAppFrom); formData.append('To', toNumber); formData.append('Body', message);

  const response = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
    method: 'POST', headers: { 'Authorization': `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString(),
  });
  const result = await response.json();

  if (!response.ok) {
    await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'whatsapp', recipient, status: 'failed', error_message: result.message }).then(() => {});
    return { success: false, error: result.message };
  }

  await supabase.from('notification_log').insert({ tenant_id, channel_id, alert_id, channel_type: 'whatsapp', recipient, status: 'sent', external_id: result.sid, sent_at: new Date().toISOString() }).then(() => {});
  return { success: true, message_sid: result.sid };
}

// ── webhook ─────────────────────────────────────────────────────────────
export async function handleNotifyWebhook(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { tenant_id, alert_id, severity, title, message, metadata } = payload as { tenant_id: string; alert_id?: string; severity?: string; title?: string; message?: string; metadata?: Record<string, unknown> };
  if (!tenant_id) return { error: 'tenant_id is required' };

  const [{ data: webhookConfigs }, { data: channels }] = await Promise.all([
    supabase.from('webhook_configs').select('id, name, url, secret, headers, tenant_id, is_active').eq('tenant_id', tenant_id).eq('is_active', true),
    supabase.from('notification_channels').select('id, name, channel_type, config, tenant_id, is_active').eq('tenant_id', tenant_id).eq('channel_type', 'webhook').eq('is_active', true),
  ]);

  const allWebhooks: Array<{ name: string; url: string; secret?: string; headers?: Record<string, string> }> = [];
  for (const wc of webhookConfigs || []) allWebhooks.push({ name: wc.name, url: wc.url, secret: wc.secret, headers: wc.headers as Record<string, string> });
  for (const ch of channels || []) { const c = ch.config as { url?: string; headers?: Record<string, string>; secret?: string }; if (c?.url) allWebhooks.push({ name: ch.name, url: c.url, secret: c.secret, headers: c.headers }); }
  if (allWebhooks.length === 0) return { dispatched: 0, message: 'No active webhook destinations' };

  let dispatched = 0, failed = 0;
  for (const webhook of allWebhooks) {
    const webhookPayload = { event: 'security_alert', timestamp: new Date().toISOString(), alert_id, severity: severity || 'info', title: title || 'CyberShield Alert', message: message || '', metadata: metadata || {}, source: 'cybershield' };
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'CyberShield-Webhook/1.0', ...(webhook.headers || {}) };
    if (webhook.secret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(webhook.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(webhookPayload)));
      headers['X-Webhook-Signature'] = `sha256=${Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    }
    try {
      const response = await fetchWithTimeout(webhook.url, { method: 'POST', headers, body: JSON.stringify(webhookPayload), timeoutMs: 10000 });
      if (response.ok) dispatched++; else { failed++; }
    } catch (_) { failed++; }
  }
  return { dispatched, failed };
}

// ── welcome ─────────────────────────────────────────────────────────────
export async function handleNotifyWelcome(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { email, fullName, userId } = payload as { email?: string; fullName?: string; userId?: string };
  if (!email || !fullName) return { error: 'Email and fullName are required' };

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return { success: false, message: 'Email service not configured' };

  const { Resend } = await import('https://esm.sh/resend@4.0.0');
  const siteUrl = Deno.env.get('SITE_URL') || 'https://cybershield.com.br';
  let tenantName = 'CyberShield';
  if (userId) {
    const { data: userRole } = await supabase.from('user_roles').select('tenant_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (userRole?.tenant_id) { const { data: tenant } = await supabase.from('tenants').select('name').eq('id', userRole.tenant_id).limit(1).maybeSingle(); if (tenant?.name) tenantName = tenant.name; }
  }

  const firstName = fullName.split(' ')[0];
  const resend = new Resend(resendApiKey);
  try {
    await resend.emails.send({ from: 'CyberShield <boas-vindas@cybershield.com.br>', to: [email], subject: `Bem-vindo ao CyberShield, ${firstName}!`, html: `<h2>Ola ${firstName}! Bem-vindo ao ${tenantName}.</h2><p><a href="${siteUrl}/dashboard">Acessar Dashboard</a></p>` });
    return { success: true, message: 'Welcome email sent' };
  } catch (err) { return { success: false, error: 'Failed to send email', details: String(err) }; }
}

// ── security notification ───────────────────────────────────────────────
export async function handleNotifySecurity(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const { channel = 'email', alertType, severity = 'info', title, message, tenantId } = payload as { channel?: string; alertType?: string; severity?: string; title?: string; message?: string; tenantId?: string };
  if (!alertType || !message) return { error: 'Missing required fields' };

  const results: Array<{ channel: string; success: boolean; error?: string }> = [];

  if (channel === 'email' || channel === 'all') {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) { results.push({ channel: 'email', success: false, error: 'RESEND_API_KEY not configured' }); }
    else if (tenantId) {
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('tenant_id', tenantId).eq('role', 'admin');
      if (adminRoles && adminRoles.length > 0) {
        const { data: users } = await supabase.auth.admin.listUsers();
        const emails = users.users.filter(u => adminRoles.some(r => r.user_id === u.id)).map(u => u.email).filter(Boolean) as string[];
        if (emails.length > 0) {
          const { Resend } = await import('https://esm.sh/resend@2.0.0');
          const resend = new Resend(resendApiKey);
          try { await resend.emails.send({ from: 'CyberShield Security <seguranca@cybershield.com.br>', to: emails, subject: `[${severity!.toUpperCase()}] ${alertType}`, html: `<h2>${title || alertType}</h2><p>${message}</p>` }); results.push({ channel: 'email', success: true }); } catch (e) { results.push({ channel: 'email', success: false, error: String(e) }); }
        } else results.push({ channel: 'email', success: false, error: 'No admin emails' });
      } else results.push({ channel: 'email', success: false, error: 'No admin roles' });
    }
  }

  return { success: results.some(r => r.success), results };
}

// ── get-telegram-chat-id (from standalone) ──────────────────────────────
export async function handleGetTelegramChatId(_supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) return { error: 'TELEGRAM_BOT_TOKEN not configured' };

  const resp = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getUpdates`);
  const data = await resp.json();
  if (!data.ok || !data.result?.length) return { message: 'Nenhuma mensagem encontrada. Envie uma mensagem para o bot no Telegram e tente novamente.', raw: data };

  const chats = data.result.map((update: Record<string, unknown>) => {
    const msg = (update.message || update.channel_post) as Record<string, unknown> | undefined;
    if (!msg) return null;
    const chat = msg.chat as Record<string, unknown>;
    return { chat_id: chat.id, chat_type: chat.type, chat_title: chat.title || `${chat.first_name || ''} ${chat.last_name || ''}`.toString().trim(), username: chat.username, last_message: (msg as Record<string, unknown>).text };
  }).filter(Boolean);

  const unique = [...new Map(chats.map((c: Record<string, unknown>) => [c.chat_id, c])).values()];
  return { chats: unique };
}