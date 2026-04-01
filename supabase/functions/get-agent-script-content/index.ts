/**
 * Get Agent Script Content
 * SECURITY: Only accessible to super_admin users
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const BodySchema = z.object({
  action: z.enum(['list-all']).optional(),
  platform: z.enum(['windows', 'linux', 'macos']).optional(),
}).passthrough();

const MIN_SCRIPT_SIZE: Record<string, number> = {
  windows: 40000,
  linux: 20000,
  macos: 20000,
};

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized', requestId }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify super_admin role
  const { data: isSuperAdmin } = await supabase.rpc('has_role', {
    _user_id: userId, _role: 'super_admin'
  });

  if (!isSuperAdmin) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden', requestId }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const action = body?.action as string | undefined;

  // ===== ACTION: list-all =====
  if (action === 'list-all') {
    const { data: releases, error: listError } = await supabase
      .from('agent_releases')
      .select('id, version, platform, channel, sha256, script_content, release_notes, is_active, signature_base64, signed_at, signed_by, created_at')
      .order('created_at', { ascending: false });

    if (listError) {
      logger.error(`[get-agent-script-content][${requestId}] list-all error`, listError as Error);
      return new Response(
        JSON.stringify({ success: false, error: listError.message, requestId }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return { releases: releases || [] };
  }

  // ===== DEFAULT: fetch script content for a platform =====
  let platform: 'windows' | 'linux' | 'macos' = 'windows';
  if (body?.platform && ['windows', 'linux', 'macos'].includes(body.platform as string)) {
    platform = body.platform as 'windows' | 'linux' | 'macos';
  }

  logger.info(`[get-agent-script-content][${requestId}] Admin ${userId} requesting script for ${platform}`);

  const minSize = MIN_SCRIPT_SIZE[platform];
  let scriptContent: string | null = null;
  let source = 'unknown';

  // Strategy 1: Storage bucket
  try {
    const scriptFileName = platform === 'windows'
      ? 'cybershield-agent-windows-v5.ps1'
      : platform === 'linux'
        ? 'cybershield-agent-linux-v5.sh'
        : 'cybershield-agent-macos-v5.sh';

    const { data: fileData, error: storageError } = await supabase.storage
      .from('agent-installers')
      .download(`scripts/${scriptFileName}`);

    if (!storageError && fileData) {
      const text = await fileData.text();
      if (text.length >= minSize) {
        scriptContent = text;
        source = 'storage';
      }
    }
  } catch { /* next strategy */ }

  // Strategy 2: agent_releases table
  if (!scriptContent) {
    try {
      const { data: release } = await supabase
        .from('agent_releases')
        .select('script_content, version')
        .eq('platform', platform)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (release?.script_content && release.script_content.length >= minSize) {
        scriptContent = release.script_content;
        source = 'agent_releases';
      }
    } catch { /* no release found */ }
  }

  if (!scriptContent || scriptContent.length < minSize) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Script ${platform} nao encontrado ou muito pequeno.`,
        requestId
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return {
    success: true,
    script_content: scriptContent,
    size_bytes: scriptContent.length,
    platform,
    source,
    requestId,
  };
}, {
  methods: ['GET', 'POST'],
  skipTenantValidation: true,
});
