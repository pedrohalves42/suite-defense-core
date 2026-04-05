/**
 * Script content preparation, hotfix, normalization, and SHA256 computation.
 * Delegates to the canonical prepareAgentScriptContent utility.
 */
import { logger } from '../_shared/logger.ts';
import { prepareAgentScriptContent } from '../_shared/agent-script-preparation.ts';

interface PreparedScript {
  finalContent: string;
  normalizedScript: string;
  base64Script: string;
  calculatedSha256: string;
  contentChanged: boolean;
}

/**
 * Prepare script content for delivery via the unified pipeline:
 * decode → hotfix → reject HTML → normalize → SHA-256 → base64
 */
export async function prepareScriptForDelivery(
  supabase: { from: (table: string) => any },
  releaseId: string,
  rawScriptContent: string | null,
  platform: string,
  requestId: string,
): Promise<PreparedScript | null> {
  const result = await prepareAgentScriptContent({
    supabase,
    releaseId,
    rawScriptContent,
    platform,
    requestId,
    logScope: 'serve-agent-update',
    persistIfChanged: true,
  });

  if (!result) {
    logger.error('[serve-agent-update] Nenhum script valido disponivel', { requestId });
    return null;
  }

  if (result.content.length < 1000) {
    logger.error('[serve-agent-update] Script too short after preparation', { requestId, length: result.content.length });
    return null;
  }

  return {
    finalContent: result.content,
    normalizedScript: result.normalizedContent,
    base64Script: result.base64Content,
    calculatedSha256: result.sha256,
    contentChanged: result.changed,
  };
}
