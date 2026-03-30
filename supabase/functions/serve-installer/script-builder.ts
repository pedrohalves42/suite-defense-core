/**
 * Script builder: fetches release scripts and builds installer content
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import {
  WINDOWS_INSTALLER_TEMPLATE,
  LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED,
  MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED
} from '../_shared/installer-template.ts';
import {
  LINUX_INSTALLER_TEMPLATE_V3_ENVVARS,
  MACOS_INSTALLER_TEMPLATE_V3_ENVVARS
} from '../_shared/installer-template-envvars.ts';
import { INSTALLER_VERSION } from '../_shared/installer-version.ts';
import type { AgentData } from './types.ts';

interface ScriptBuildResult {
  templateContent: string;
  agentScriptHash: string;
}

/**
 * Fetches platform scripts from agent_releases and builds the installer template
 */
export async function buildInstallerScript(
  supabaseClient: SupabaseClient,
  platform: string,
  mode: 'args' | 'envvars',
  agentData: AgentData,
  agentToken: string,
  supabaseUrl: string,
  requestId: string,
  origin: string | null,
): Promise<ScriptBuildResult | Response> {
  const { validateAgentScriptContent, calculateScriptHash } = await import('../_shared/agent-script-validator.ts');

  // Fetch Windows agent script from agent_releases
  logger.debug(`[${requestId}] Fetching ${platform} agent script from agent_releases database`);

  const { data: releaseData, error: releaseError } = await supabaseClient
    .from('agent_releases')
    .select('script_content, version, sha256')
    .eq('platform', platform === 'windows' ? 'windows' : platform)
    .eq('is_active', true)
    .like('version', 'v%')
    .not('script_content', 'ilike', '<!DOCTYPE html%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (releaseError || !releaseData?.script_content) {
    logger.error(`[${requestId}] No active ${platform} agent release found:`, releaseError);
    return new Response(
      JSON.stringify({
        error: `No active ${platform} agent release found`,
        details: `Please register an active agent release for ${platform} in Admin > Agent Releases`,
        requestId,
      }),
      { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  const agentScriptContent = releaseData.script_content;

  if (platform === 'windows' && !validateAgentScriptContent(agentScriptContent)) {
    logger.error(`[${requestId}] CRITICAL: Script validation failed for ${platform} release`);
    return new Response(
      'Failed to generate secure installer - script validation failed',
      { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain' } }
    );
  }

  if (platform === 'windows' && (!agentScriptContent || agentScriptContent.length < 5000)) {
    logger.error(`[${requestId}] Agent script validation failed: invalid content length (${agentScriptContent?.length || 0} bytes)`);
    return new Response('Agent script validation failed: content too short or missing', {
      status: 503, headers: buildCorsHeaders(origin),
    });
  }

  const agentScriptHash = await calculateScriptHash(agentScriptContent);

  logger.debug(`[${requestId}] ${platform} agent script loaded from database`, {
    size: agentScriptContent.length,
    sizeKB: (agentScriptContent.length / 1024).toFixed(2),
    hash: agentScriptHash,
    registeredVersion: releaseData.version,
    source: 'agent_releases',
  });

  // Select template based on platform and mode
  let templateContent: string;
  if (platform === 'windows') {
    templateContent = WINDOWS_INSTALLER_TEMPLATE;
  } else if (platform === 'macos') {
    templateContent = mode === 'envvars'
      ? MACOS_INSTALLER_TEMPLATE_V3_ENVVARS
      : MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED;
  } else if (platform === 'linux') {
    templateContent = mode === 'envvars'
      ? LINUX_INSTALLER_TEMPLATE_V3_ENVVARS
      : LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED;
  } else {
    logger.error(`[${requestId}] Unsupported platform: ${platform}`);
    return new Response(
      JSON.stringify({
        error: 'Unsupported platform',
        details: `Platform "${platform}" is not supported. Use windows, linux, or macos.`,
        requestId,
      }),
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Replace placeholders
  templateContent = templateContent
    .replace(/\{\{AGENT_TOKEN\}\}/g, () => agentToken)
    .replace(/\{\{HMAC_SECRET\}\}/g, () => agentData.hmac_secret)
    .replace(/\{\{SERVER_URL\}\}/g, () => supabaseUrl)
    .replace(/\{\{POLL_INTERVAL\}\}/g, '60')
    .replace(/\{\{AGENT_HASH\}\}/g, () => agentScriptHash)
    .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, () => agentScriptContent)
    .replace(/\{\{AGENT_NAME\}\}/g, () => agentData.agent_name)
    .replace(/\{\{AGENT_VERSION\}\}/g, '3.0.0')
    .replace(/\{\{AGENT_SCRIPT_URL\}\}/g, () => '')
    .replace(/\{\{INSTALLER_VERSION\}\}/g, INSTALLER_VERSION)
    .replace(/\{\{TIMESTAMP\}\}/g, () => new Date().toISOString());

  // Check for remaining placeholders
  if (templateContent.includes('{{')) {
    const remainingPlaceholders = templateContent.match(/\{\{[A-Z_]+\}\}/g) || [];
    logger.error(`[${requestId}] INCOMPLETE TEMPLATE - Found ${remainingPlaceholders.length} unresolved placeholders:`, remainingPlaceholders);

    remainingPlaceholders.slice(0, 3).forEach((placeholder, idx) => {
      const pos = templateContent.indexOf(placeholder);
      const context = templateContent.substring(Math.max(0, pos - 100), pos + 150);
      logger.error(`[${requestId}] Placeholder ${idx + 1} context:`, context.replace(/\n/g, '\\n'));
    });

    return new Response(
      `Installer generation failed: ${remainingPlaceholders.length} incomplete placeholders: ${remainingPlaceholders.slice(0, 5).join(', ')}`,
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain' } }
    );
  }

  return { templateContent, agentScriptHash };
}
