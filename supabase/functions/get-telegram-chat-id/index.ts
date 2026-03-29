/**
 * get-telegram-chat-id - Retrieves Telegram chat IDs from bot updates
 * Migrated to servePublic middleware
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

servePublic(async (_req, ctx) => {
  const { requestId } = ctx;

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    return new Response(
      JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const resp = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getUpdates`);
  const data = await resp.json();

  if (!data.ok || !data.result?.length) {
    return {
      message: 'Nenhuma mensagem encontrada. Envie uma mensagem para o bot no Telegram e tente novamente.',
      raw: data,
    };
  }

  const chats = data.result.map((update: Record<string, unknown>) => {
    const msg = (update.message || update.channel_post) as Record<string, unknown> | undefined;
    if (!msg) return null;
    const chat = msg.chat as Record<string, unknown>;
    return {
      chat_id: chat.id,
      chat_type: chat.type,
      chat_title: chat.title || `${chat.first_name || ''} ${chat.last_name || ''}`.toString().trim(),
      username: chat.username,
      last_message: (msg as Record<string, unknown>).text,
    };
  }).filter(Boolean);

  // Deduplicate by chat_id
  const unique = [...new Map(chats.map((c: Record<string, unknown>) => [c.chat_id, c])).values()];

  return { chats: unique };
}, { methods: ['GET', 'POST'] });
