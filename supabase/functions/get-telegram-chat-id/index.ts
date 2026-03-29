import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
// deno-lint-ignore-file

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), {
      status: 400,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  try {
    const resp = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const data = await resp.json();

    if (!data.ok || !data.result?.length) {
      return new Response(JSON.stringify({ 
        message: 'Nenhuma mensagem encontrada. Envie uma mensagem para o bot no Telegram e tente novamente.',
        raw: data 
      }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const chats = data.result.map((update: Record<string, unknown>) => {
      const msg = update.message || update.channel_post;
      if (!msg) return null;
      return {
        chat_id: msg.chat.id,
        chat_type: msg.chat.type,
        chat_title: msg.chat.title || `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`.trim(),
        username: msg.chat.username,
        last_message: msg.text,
      };
    }).filter(Boolean);

    // Deduplicate by chat_id
    const unique = [...new Map(chats.map((c: Record<string, unknown>) => [c.chat_id, c])).values()];

    return new Response(JSON.stringify({ chats: unique }), {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
