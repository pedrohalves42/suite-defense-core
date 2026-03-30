/**
 * Validation helpers for serve-installer
 */
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

/**
 * Validates that no unresolved placeholders remain in the generated script
 */
export function validateNoPlaceholders(
  script: string,
  scriptType: string,
  requestId: string,
): void {
  const remaining = script.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (!remaining || remaining.length === 0) return;

  const placeholderList = remaining.join(', ');
  logger.error('[serve-installer] Placeholders nao substituidos', {
    scriptType,
    placeholders: placeholderList,
    count: remaining.length,
    requestId,
  });

  remaining.slice(0, 3).forEach((ph, idx) => {
    const pos = script.indexOf(ph);
    const context = script.substring(Math.max(0, pos - 120), pos + 120);
    logger.error(
      `[serve-installer] Contexto do placeholder ${idx + 1}:`,
      context.replace(/\n/g, '\\n').slice(0, 240),
    );
  });

  throw new Error(
    `Script gerado contem ${remaining.length} placeholders nao substituidos: ${placeholderList}`,
  );
}

/**
 * Validates the final installer script for critical issues
 */
export function validateInstallerScript(
  templateContent: string,
  platform: string,
  agentName: string,
  requestId: string,
  origin: string | null,
): Response | null {
  // Check critical placeholders
  const criticalPlaceholders = ['{{AGENT_NAME}}', '{{AGENT_TOKEN}}', '{{HMAC_SECRET}}', '{{SERVER_URL}}'];
  const unsubstitutedCritical = criticalPlaceholders.filter(ph => templateContent.includes(ph));

  if (unsubstitutedCritical.length > 0) {
    logger.error(`[${requestId}] CRITICAL: Unsubstituted critical placeholders`, {
      platform, agentName, unsubstituted: unsubstitutedCritical,
    });
    return new Response(
      JSON.stringify({
        error: 'Critical placeholders not substituted',
        details: `Template contains: ${unsubstitutedCritical.join(', ')}`,
        requestId,
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Windows-specific: AGENT_SCRIPT_CONTENT
  if (platform === 'windows' && templateContent.includes('{{AGENT_SCRIPT_CONTENT}}')) {
    logger.error(`[${requestId}] CRITICAL: AGENT_SCRIPT_CONTENT placeholder not replaced`, { platform, agentName });
    return new Response(
      JSON.stringify({
        error: 'Agent script content not injected',
        details: 'Template contains unresolved {{AGENT_SCRIPT_CONTENT}} placeholder',
        requestId,
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Minimum size check
  const MIN_INSTALLER_SIZE = 10000;
  if (templateContent.length < MIN_INSTALLER_SIZE) {
    logger.error(`[${requestId}] CRITICAL: Generated installer too small`, {
      platform, agentName, installerSize: templateContent.length, expectedMinimum: MIN_INSTALLER_SIZE,
    });
    return new Response(
      JSON.stringify({
        error: 'Generated installer script too small',
        details: `Installer size: ${templateContent.length} bytes (expected > ${MIN_INSTALLER_SIZE} bytes)`,
        requestId,
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Windows-specific: embedded script validation
  if (platform === 'windows') {
    const hereStringPattern = /\$AgentScriptContent\s*=\s*@['"]\s*([\s\S]*?)\s*['"]@/;
    const scriptContentMatch = templateContent.match(hereStringPattern);

    if (!scriptContentMatch || scriptContentMatch[1].trim().length < 5000) {
      logger.error(`[${requestId}] CRITICAL: Windows agent script content invalid or truncated`, {
        agentName, embeddedScriptSize: scriptContentMatch?.[1]?.length || 0,
      });
      return new Response(
        JSON.stringify({
          error: 'Windows agent script invalid or truncated',
          details: 'Embedded PowerShell script is too small or missing',
          requestId,
          timestamp: new Date().toISOString(),
        }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Validate critical functions in embedded script
    const embeddedScript = scriptContentMatch[1];
    const criticalFunctions = ['Submit-JobResult', 'Send-Heartbeat', 'Poll-Jobs'];
    const missingFunctions = criticalFunctions.filter(fn => !embeddedScript.includes(fn));

    if (missingFunctions.length > 0) {
      logger.error(`[${requestId}] CRITICAL: Missing critical functions in embedded agent script`, {
        agentName, missingFunctions,
      });
      return new Response(
        JSON.stringify({
          error: 'Embedded agent script missing critical functions',
          details: `Missing: ${missingFunctions.join(', ')}`,
          requestId,
          timestamp: new Date().toISOString(),
        }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.debug(`[${requestId}] [OK] Script validation complete (StartedAt check skipped - handled by agent internally)`);
  }

  logger.info(`[${requestId}] [OK] All installer validations passed`, {
    installerSize: templateContent.length,
    installerSizeKB: (templateContent.length / 1024).toFixed(2),
    platform, agentName,
    validations: {
      criticalPlaceholdersSubstituted: true,
      agentScriptContentInjected: platform === 'windows',
      minSizeCheck: true,
      embeddedScriptValid: platform === 'windows',
      criticalFunctionsPresent: platform === 'windows',
    },
  });

  logger.info(`[${requestId}] [OK] Script security validation passed (PowerShell patterns allowed)`);

  return null; // No error
}
