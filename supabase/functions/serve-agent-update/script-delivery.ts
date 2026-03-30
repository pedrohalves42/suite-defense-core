/**
 * Script content preparation, hotfix, normalization, and SHA256 computation.
 */
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { logger } from '../_shared/logger.ts';
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts';
import { normalizeForWindows } from '../_shared/hexagonal/update-decision-service.ts';

interface PreparedScript {
  finalContent: string;
  normalizedScript: string;
  base64Script: string;
  calculatedSha256: string;
}

/**
 * Prepare script content for delivery:
 * 1. Apply Windows hotfix if needed
 * 2. Reject HTML-corrupted content
 * 3. Normalize line endings
 * 4. Calculate SHA256 and base64
 */
export async function prepareScriptForDelivery(
  supabase: { from: (table: string) => any },
  releaseId: string,
  rawScriptContent: string | null,
  platform: string,
  requestId: string,
): Promise<PreparedScript | null> {
  let finalScriptContent = rawScriptContent;

  if (platform === 'windows' && finalScriptContent) {
    const hotfix = applyWindowsScriptHotfix(finalScriptContent);
    if (hotfix.changed) {
      finalScriptContent = hotfix.content;
      logger.warn('[serve-agent-update] Applied Windows hotfix before delivery', {
        requestId, releaseVersion: releaseId, reasons: hotfix.reasons,
      });
      const { error: persistError } = await supabase.from('agent_releases').update({ script_content: finalScriptContent }).eq('id', releaseId);
      if (persistError) {
        logger.warn('[serve-agent-update] Could not persist hotfixed script', { requestId, error: persistError.message });
      }
    }
  }

  // SAFETY: Reject HTML content
  if (finalScriptContent && (finalScriptContent.trimStart().startsWith('<!DOCTYPE') || finalScriptContent.trimStart().startsWith('<html'))) {
    logger.error('[serve-agent-update] DB script_content is corrupted HTML, rejecting', {
      requestId, platform, preview: finalScriptContent.substring(0, 100),
    });
    finalScriptContent = '';
  }

  if (!finalScriptContent || finalScriptContent.length < 1000) {
    logger.error('[serve-agent-update] Nenhum script valido disponivel', { requestId });
    return null;
  }

  const normalizedScript = normalizeForWindows(finalScriptContent);
  const scriptBytes = new TextEncoder().encode(normalizedScript);
  const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
  const calculatedSha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  const base64Script = encodeBase64(scriptBytes);

  return {
    finalContent: finalScriptContent,
    normalizedScript,
    base64Script,
    calculatedSha256,
  };
}
