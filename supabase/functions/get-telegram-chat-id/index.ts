// deno-lint-ignore-file

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not configured' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const data = await resp.json();

    if (!data.ok || !data.result?.length) {
      return new Response(JSON.stringify({ 
        message: 'Nenhuma mensagem encontrada. Envie uma mensagem para o bot no Telegram e tente novamente.',
        raw: data 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chats = data.result.map((update: any) => {
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
    const unique = [...new Map(chats.map((c: any) => [c.chat_id, c])).values()];

    return new Response(JSON.stringify({ chats: unique }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
