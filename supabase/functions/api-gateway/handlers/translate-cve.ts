/**
 * translate-cve handler — Inlined from standalone function (Phase 6C)
 * Translates CVE descriptions from English to Portuguese using AI.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { aiSimpleComplete } from '../../_shared/ai-multi-provider.ts';
import { logger } from '../../_shared/logger.ts';

export async function handleTranslateCve(
  _supabase: any,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const description = payload.description as string | undefined;
  const cve_id = payload.cve_id as string | undefined;

  if (!description) {
    return { __status: 400, error: 'Description required' };
  }

  const systemPrompt = `Voce e um tradutor tecnico especializado em seguranca da informacao.
Traduza a descricao de vulnerabilidade CVE do ingles para portugues brasileiro.
Mantenha termos tecnicos importantes em ingles quando apropriado (ex: buffer overflow, SQL injection, XSS).
Seja conciso e claro. Responda APENAS com a traducao, sem explicacoes adicionais.`;

  const response = await aiSimpleComplete(
    systemPrompt,
    `Traduza para portugues: "${description}"`,
    { maxTokens: 500, functionName: 'translate-cve' },
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
}
