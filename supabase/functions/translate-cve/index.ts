import { serveTenant } from '../_shared/serve-tenant.ts';
import { aiSimpleComplete, getProviderStatus } from '../_shared/ai-multi-provider.ts';
import { logger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface TranslateCveBody {
  tenant_id?: string;
  cve_id?: string;
  description: string;
}

serveTenant<TranslateCveBody>(async (_req, ctx) => {
  const { body, requestId } = ctx;
  const { cve_id, description } = body;

  if (!description) {
    return new Response(
      JSON.stringify({ error: 'Description required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
    logger.error(`[translate-cve][${requestId}] AI translation error:`, response.error);
    return {
      translated: description,
      error: response.error,
      provider: response.provider,
    };
  }

  logger.info(`[translate-cve][${requestId}] CVE ${cve_id} translated via ${response.provider} in ${response.latencyMs}ms`);

  return {
    cve_id,
    translated: response.content,
    original: description,
    provider: response.provider,
    model: response.model,
    latencyMs: response.latencyMs,
    usedFallback: response.usedFallback,
  };
});
