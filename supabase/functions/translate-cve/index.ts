import { aiSimpleComplete, getProviderStatus } from '../_shared/ai-multi-provider.ts';
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { cve_id, description } = await req.json();

    if (!description) {
      return new Response(JSON.stringify({ error: 'Description required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `Você é um tradutor técnico especializado em segurança da informação.
Traduza a descrição de vulnerabilidade CVE do inglês para português brasileiro.
Mantenha termos técnicos importantes em inglês quando apropriado (ex: buffer overflow, SQL injection, XSS).
Seja conciso e claro. Responda APENAS com a tradução, sem explicações adicionais.`;

    const response = await aiSimpleComplete(
      systemPrompt,
      `Traduza para português: "${description}"`,
      {
        maxTokens: 500,
        functionName: 'translate-cve',
      }
    );

    if (response.error) {
      logger.error('AI translation error:', response.error);
      return new Response(JSON.stringify({ 
        translated: description, // Fallback to original
        error: response.error,
        provider: response.provider,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info(`[translate-cve] CVE ${cve_id} translated via ${response.provider} in ${response.latencyMs}ms`);

    return new Response(JSON.stringify({ 
      cve_id,
      translated: response.content,
      original: description,
      provider: response.provider,
      model: response.model,
      latencyMs: response.latencyMs,
      usedFallback: response.usedFallback,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Translation error:', errorMessage);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      translated: null,
      providers: getProviderStatus(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
