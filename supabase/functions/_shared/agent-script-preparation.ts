import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { normalizeForWindows } from './hexagonal/update-decision-service.ts';
import { logger } from './logger.ts';
import { applyWindowsScriptHotfix } from './windows-script-hotfix.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PersistableSupabaseLike = any;

export interface PreparedAgentScript {
  content: string;
  normalizedContent: string;
  sha256: string;
  base64Content: string;
  changed: boolean;
  reasons: string[];
}

function isHtmlContent(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html');
}

function looksLikeWindowsScript(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('<#') || trimmed.startsWith('param(') || trimmed.startsWith('[CmdletBinding()]') || content.includes('CyberShield Agent') || content.includes('Write-Log');
}

function looksLikeUnixScript(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('#!/') || content.includes('CyberShield Agent') || content.includes('function ');
}

export function maybeDecodeScriptContent(rawScriptContent: string | null, platform: string): { content: string | null; decoded: boolean } {
  if (!rawScriptContent) return { content: null, decoded: false };
  if (isHtmlContent(rawScriptContent)) return { content: rawScriptContent, decoded: false };

  const looksLikeScript = platform === 'windows'
    ? looksLikeWindowsScript(rawScriptContent)
    : looksLikeUnixScript(rawScriptContent);

  if (looksLikeScript) return { content: rawScriptContent, decoded: false };

  try {
    const decoded = atob(rawScriptContent);
    const decodedLooksLikeScript = platform === 'windows'
      ? looksLikeWindowsScript(decoded)
      : looksLikeUnixScript(decoded);

    if (decodedLooksLikeScript) {
      return { content: decoded, decoded: true };
    }
  } catch {
    // Not base64 – keep raw content.
  }

  return { content: rawScriptContent, decoded: false };
}

export async function prepareAgentScriptContent(params: {
  supabase?: PersistableSupabaseLike;
  releaseId?: string;
  rawScriptContent: string | null;
  platform: string;
  requestId: string;
  logScope: string;
  persistIfChanged?: boolean;
}): Promise<PreparedAgentScript | null> {
  const { supabase, releaseId, rawScriptContent, platform, requestId, logScope, persistIfChanged = true } = params;
  const decodeResult = maybeDecodeScriptContent(rawScriptContent, platform);
  let scriptContent = decodeResult.content;
  const reasons: string[] = [];
  let changed = decodeResult.decoded;

  if (decodeResult.decoded) {
    reasons.push('decoded_base64_script');
    logger.warn(`[${logScope}] Decoded base64 script content before delivery`, { requestId, platform });
  }

  if (!scriptContent) return null;

  if (platform === 'windows') {
    const hotfix = applyWindowsScriptHotfix(scriptContent);
    if (hotfix.changed) {
      scriptContent = hotfix.content;
      changed = true;
      reasons.push(...hotfix.reasons);
      logger.warn(`[${logScope}] Applied Windows hotfix before delivery`, { requestId, releaseId: releaseId || null, reasons: hotfix.reasons });
    }
  }

  if (isHtmlContent(scriptContent)) {
    logger.error(`[${logScope}] Script content is corrupted HTML`, {
      requestId,
      platform,
      preview: scriptContent.substring(0, 120),
    });
    return null;
  }

  const normalizedContent = platform === 'windows'
    ? normalizeForWindows(scriptContent)
    : scriptContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const scriptBytes = new TextEncoder().encode(normalizedContent);
  const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
  const sha256 = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const base64Content = encodeBase64(scriptBytes);

  if (changed && persistIfChanged && supabase && releaseId) {
    const { error: persistError } = await supabase.from('agent_releases').update({
      script_content: scriptContent,
      sha256,
    }).eq('id', releaseId);

    if (persistError) {
      logger.warn(`[${logScope}] Could not persist prepared script`, {
        requestId,
        releaseId,
        error: persistError.message,
      });
    }
  }

  return {
    content: scriptContent,
    normalizedContent,
    sha256,
    base64Content,
    changed,
    reasons,
  };
}