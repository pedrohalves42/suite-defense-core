/**
 * setup-agent-script - Migrated to serveInternal
 * Sets up agent script in storage
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  logger.info(`[${requestId}] Setup agent script in storage`);

  try {
    const { validateAgentScriptContent } = await import('../_shared/agent-script-validator.ts');

    // Fetch script from storage bucket
    logger.info(`[${requestId}] Fetching agent script from storage`);
    const { data: fileData, error: storageError } = await supabase.storage
      .from('agent-installers')
      .download('scripts/cybershield-agent-windows-v5.ps1');

    if (storageError || !fileData) {
      logger.info(`[${requestId}] Script not in storage, fetching from agent_releases table`);
      const { data: release, error: releaseError } = await supabase
        .from('agent_releases')
        .select('script_content, version, sha256')
        .eq('platform', 'windows')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (releaseError || !release?.script_content) {
        return new Response(
          JSON.stringify({ error: 'No agent script found in storage or releases table', details: releaseError?.message }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const validation = validateAgentScriptContent(release.script_content);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: 'Agent script validation failed', details: validation.errors }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Upload to storage
      const scriptBlob = new Blob([release.script_content], { type: 'text/plain' });
      const { error: uploadError } = await supabase.storage
        .from('agent-installers')
        .upload('scripts/cybershield-agent-windows-v3.ps1', scriptBlob, { upsert: true, contentType: 'text/plain' });

      if (uploadError) {
        return new Response(
          JSON.stringify({ error: 'Failed to upload script to storage', details: uploadError.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      logger.info(`[${requestId}] Script uploaded from releases table (v${release.version})`);
      return {
        success: true, source: 'agent_releases', version: release.version,
        sha256: release.sha256, size: release.script_content.length,
      };
    }

    const scriptContent = await fileData.text();
    const validation = validateAgentScriptContent(scriptContent);

    logger.info(`[${requestId}] Script found in storage (${scriptContent.length} bytes, valid=${validation.valid})`);

    return {
      success: true, source: 'storage', size: scriptContent.length,
      valid: validation.valid, validation_errors: validation.errors,
    };
  } catch (error) {
    logger.error(`[${requestId}] Error:`, error);
    throw error;
  }
});
