/**
 * Script builder: fetches release scripts and builds installer content (shared)
 * Uses the canonical prepareAgentScriptContent pipeline.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';
import { buildCorsHeaders } from './cors.ts';
import {
  WINDOWS_INSTALLER_TEMPLATE,
  LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED,
  MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED
} from './installer-template.ts';
import {
  LINUX_INSTALLER_TEMPLATE_V3_ENVVARS,
  MACOS_INSTALLER_TEMPLATE_V3_ENVVARS
} from './installer-template-envvars.ts';
import { INSTALLER_VERSION } from './installer-version.ts';
import type { AgentData } from './installer-types.ts';
import { prepareAgentScriptContent } from './agent-script-preparation.ts';

interface ScriptBuildResult {
  templateContent: string;
  agentScriptHash: string;
}

export async function buildInstallerScript(
  supabaseClient: any,
  platform: string,
  mode: 'args' | 'envvars',
  agentData: AgentData,
  agentToken: string,
  supabaseUrl: string,
  requestId: string,
  origin: string | null,
): Promise<ScriptBuildResult | Response> {
  const { validateAgentScriptContent } = await import('./agent-script-validator.ts');

  logger.debug(`[${requestId}] Fetching ${platform} agent script from agent_releases database`);

  const { data: releaseData, error: releaseError } = await supabaseClient
    .from('agent_releases')
    .select('id, script_content, version, sha256')
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
      JSON.stringify({ error: `No active ${platform} agent release found`, details: `Please register an active agent release for ${platform} in Admin > Agent Releases`, requestId }),
      { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Unified pipeline: decode → hotfix → reject HTML → normalize → SHA-256 → base64
  const prepared = await prepareAgentScriptContent({
    supabase: supabaseClient,
    releaseId: releaseData.id,
    rawScriptContent: releaseData.script_content,
    platform,
    requestId,
    logScope: 'installer-script-builder',
    persistIfChanged: true,
  });

  if (!prepared) {
    logger.error(`[${requestId}] Script preparation failed for ${platform} release`);
    return new Response('Failed to generate secure installer - script preparation failed', { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain' } });
  }

  const agentScriptContent = prepared.content;
  const agentScriptHash = prepared.sha256;

  if (platform === 'windows' && !validateAgentScriptContent(agentScriptContent)) {
    logger.error(`[${requestId}] CRITICAL: Script validation failed for ${platform} release`);
    return new Response('Failed to generate secure installer - script validation failed', { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain' } });
  }

  if (platform === 'windows' && agentScriptContent.length < 5000) {
    logger.error(`[${requestId}] Agent script validation failed: invalid content length (${agentScriptContent.length} bytes)`);
    return new Response('Agent script validation failed: content too short or missing', { status: 503, headers: buildCorsHeaders(origin) });
  }

  logger.debug(`[${requestId}] ${platform} agent script loaded from database`, {
    size: agentScriptContent.length, sizeKB: (agentScriptContent.length / 1024).toFixed(2),
    hash: agentScriptHash, registeredVersion: releaseData.version, source: 'agent_releases',
    hotfixApplied: prepared.changed, hotfixReasons: prepared.reasons,
  });

  let templateContent: string;
  if (platform === 'windows') {
    templateContent = WINDOWS_INSTALLER_TEMPLATE;
  } else if (platform === 'macos') {
    templateContent = mode === 'envvars' ? MACOS_INSTALLER_TEMPLATE_V3_ENVVARS : MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED;
  } else if (platform === 'linux') {
    templateContent = mode === 'envvars' ? LINUX_INSTALLER_TEMPLATE_V3_ENVVARS : LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED;
  } else {
    logger.error(`[${requestId}] Unsupported platform: ${platform}`);
    return new Response(
      JSON.stringify({ error: 'Unsupported platform', details: `Platform "${platform}" is not supported. Use windows, linux, or macos.`, requestId }),
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Securely escape values for PowerShell and Shell templates to prevent injection
  const escapeValue = (val: string, p: string) => {
    if (p === 'windows') {
      // PowerShell escaping: escape single quotes by doubling them
      return val.replace(/'/g, "''");
    }
    // Shell escaping (Linux/macOS): simple escape for single quotes
    return val.replace(/'/g, "'\\''");
  };

  templateContent = templateContent
    .replace(/\{\{AGENT_TOKEN\}\}/g, () => escapeValue(agentToken, platform))
    .replace(/\{\{HMAC_SECRET\}\}/g, () => escapeValue(agentData.hmac_secret, platform))
    .replace(/\{\{SERVER_URL\}\}/g, () => escapeValue(supabaseUrl, platform))
    .replace(/\{\{POLL_INTERVAL\}\}/g, '60')
    .replace(/\{\{AGENT_HASH\}\}/g, () => escapeValue(agentScriptHash, platform))
    .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, () => agentScriptContent) // Content already validated and managed separately
    .replace(/\{\{AGENT_NAME\}\}/g, () => escapeValue(agentData.agent_name, platform))
    .replace(/\{\{AGENT_VERSION\}\}/g, '3.0.0')
    .replace(/\{\{AGENT_SCRIPT_URL\}\}/g, () => '')
    .replace(/\{\{INSTALLER_VERSION\}\}/g, INSTALLER_VERSION)
    .replace(/\{\{TIMESTAMP\}\}/g, () => new Date().toISOString());

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
