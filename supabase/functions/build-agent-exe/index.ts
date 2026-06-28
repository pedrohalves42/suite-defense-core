
/**
 * build-agent-exe Edge Function ? Modularized & migrated to serveTenant
 *
 * Handles:
 * - GET: Health check (pre-auth, handled before serveTenant)
 * - POST: Trigger GitHub Actions build for Windows agent installer
 *
 * Modules: validation.ts, cache.ts, github-dispatch.ts
 * The large Windows installer PS1 template is imported from _shared/installer-template.ts
 */

import { requireEnv, optionalEnv } from '../_shared/env.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { createErrorResponse, ErrorCode } from '../_shared/error-handler.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { BuildTelemetry } from '../_shared/build-telemetry.ts';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { serveTenant } from '../_shared/serve-tenant.ts';

import { BuildRequestSchema, validateEnrollment, fetchAgentCredentials } from './validation.ts';
import { checkBuildCache } from './cache.ts';
import { validateGitHubAccess, dispatchBuild } from './github-dispatch.ts';

const BUILD_GH_TOKEN = Deno.env.get('BUILD_GH_TOKEN');
const BUILD_GH_REPOSITORY = Deno.env.get('BUILD_GH_REPOSITORY');

// ??? Health Check (pre-auth GET) ????????????????????????????????????????????
// Handled inside serveTenant with methods: ['GET', 'POST']
// GET returns health status; POST triggers build.

serveTenant(async (req, ctx) => {
  const origin = req.headers.get("origin");
  const { supabase, userId, requestId, body } = ctx;

  // ?? GET: Health check ??
  if (req.method === 'GET') {
    const healthy = !!(
      Deno.env.get('SUPABASE_URL') &&
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') &&
      BUILD_GH_TOKEN &&
      BUILD_GH_REPOSITORY
    );
    return new Response(
      JSON.stringify({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'build-agent-exe',
        checks: {
          env_vars: healthy,
          supabase_url: !!Deno.env.get('SUPABASE_URL'),
          service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
          github_token: !!BUILD_GH_TOKEN,
          github_repo: !!BUILD_GH_REPOSITORY,
        },
      }),
      { status: healthy ? 200 : 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // ?? POST: Build agent EXE ??
  if (!userId) {
    return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', 401, requestId);
  }

  // 1. Validate input
  const parsed = BuildRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse(ErrorCode.BAD_REQUEST, 'Validation failed', 400, requestId);
  }
  const { agent_name, enrollment_key } = parsed.data;

  logger.info(`[${requestId}] ========== BUILD REQUEST START ==========`);

  try {
    return await withTimeout(async () => {
      let telemetry: BuildTelemetry | null = null;

      // 2. Validate enrollment key & tenant access
      const enrollment = await validateEnrollment(supabase, enrollment_key, userId, requestId);
      if (enrollment.error || !enrollment.data) {
        return createErrorResponse(
          enrollment.status === 403 ? ErrorCode.UNAUTHORIZED : ErrorCode.BAD_REQUEST,
          enrollment.error || 'Invalid enrollment',
          enrollment.status || 400,
          requestId
        );
      }
      const { enrollmentId, agentId, tenantId, agentToken } = enrollment.data;

      // 3. Fetch agent credentials
      const creds = await fetchAgentCredentials(supabase, agentId);
      if (creds.error || !creds.data) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, creds.error || 'Agent credentials incomplete', 500, requestId);
      }

      // 4. Fetch & validate agent script from storage
      const { validateAgentScriptContent } = await import('../_shared/agent-script-validator.ts');
      const { prepareAgentScriptContent } = await import('../_shared/agent-script-preparation.ts');

      const { data: fileData, error: storageError } = await supabase.storage
        .from('agent-installers')
        .download('scripts/cybershield-agent-windows-v5.ps1');

      if (storageError || !fileData) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Agent script not found in storage', 503, requestId);
      }

      const rawScriptText = await fileData.text();

      // Unified pipeline: decode → hotfix → reject HTML → normalize → SHA-256 → base64
      const prepared = await prepareAgentScriptContent({
        rawScriptContent: rawScriptText,
        platform: 'windows',
        requestId,
        logScope: 'build-agent-exe',
        persistIfChanged: false, // Storage source, not DB
      });

      if (!prepared) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Agent script preparation failed', 503, requestId);
      }

      const agentScriptContent = prepared.content;
      const scriptValidation = validateAgentScriptContent(agentScriptContent);
      if (!scriptValidation.valid) {
        logger.error(`[${requestId}] Agent script content invalid`, { errors: scriptValidation.errors });
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, `Agent script content is invalid: ${(scriptValidation.errors ?? []).join('; ')}`, 503, requestId);
      }
      const agentScriptHash = prepared.sha256;

      // 5. Check build cache
      const cachedResponse = await checkBuildCache(supabase, tenantId, agentScriptHash, requestId, origin);
      if (cachedResponse) return cachedResponse;

      // 6. Generate installer content
      const SUPABASE_URL = requireEnv('SUPABASE_URL');
      const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

      // Import the installer template from shared module
      const { WINDOWS_INSTALLER_TEMPLATE } = await import('../_shared/installer-template-windows.ts');
      const { buildInstallerScript } = await import('../_shared/installer-script-builder.ts');

      const buildResult = await buildInstallerScript(
        supabase,
        'windows',
        'args',
        { agent_name, hmac_secret: creds.data.hmacSecret, os_type: 'windows' },
        agentToken,
        SUPABASE_URL,
        requestId,
        origin
      );

      if (buildResult instanceof Response) return buildResult;
      const installerContent = buildResult.templateContent;
      // HF-BUILD-DUP-DECL-01: removed dead duplicate `const agentScriptHash = buildResult.agentScriptHash;`
      // The hash from prepared storage script (line 129) is the canonical one used for cache key and DB record.

      // 7. Create build record
      const { data: buildRecord, error: buildError } = await supabase
        .from('agent_builds')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          enrollment_key_id: enrollmentId,
          build_status: 'building',
          build_started_at: new Date().toISOString(),
          created_by: userId,
          script_hash: agentScriptHash,
          ps1_version: 'v5.0.15',
        })
        .select()
        .single();

      if (buildError) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to create build', 500, requestId);
      }

      telemetry = new BuildTelemetry(buildRecord.id, requestId);

      // 8. Validate GitHub config
      if (!BUILD_GH_TOKEN || !BUILD_GH_REPOSITORY) {
        const msg = 'GitHub integration not configured';
        telemetry.failBuild(msg);
        await supabase.from('agent_builds').update({
          build_status: 'failed', error_message: msg, build_completed_at: new Date().toISOString(),
        }).eq('id', buildRecord.id);
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build service not configured', 500, requestId);
      }

      const ghAccess = await validateGitHubAccess({ token: BUILD_GH_TOKEN, repository: BUILD_GH_REPOSITORY }, requestId);
      if (!ghAccess.ok) {
        telemetry.failBuild(ghAccess.error!);
        await supabase.from('agent_builds').update({
          build_status: 'failed', error_message: ghAccess.error, build_completed_at: new Date().toISOString(),
        }).eq('id', buildRecord.id);
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'GitHub API unreachable', 500, requestId);
      }

      // 9. Encode installer & dispatch to GitHub
      const ps1Base64 = encodeBase64(new TextEncoder().encode(installerContent));
      const githubActionsUrl = `https://github.com/${BUILD_GH_REPOSITORY}/actions`;

      const workflowPayload = {
        ps1_content_base64: ps1Base64,
        output_name: `CyberShield-Agent-${agent_name}-${Date.now()}.exe`,
        version: '5.0.15',
        build_id: buildRecord.id,
        callback_url: `${SUPABASE_URL}/functions/v1/build-callback`,
        callback_token: SUPABASE_SERVICE_ROLE_KEY,
      };

      const result = await dispatchBuild(
        { token: BUILD_GH_TOKEN, repository: BUILD_GH_REPOSITORY },
        workflowPayload,
        installerContent,
        requestId,
        telemetry
      );

      if (!result.success) {
        const errorMessage = `Both dispatch methods failed: ${result.error}`;
        telemetry.failBuild(errorMessage);
        await supabase.from('agent_builds').update({
          build_status: 'failed', error_message: errorMessage, build_completed_at: new Date().toISOString(),
        }).eq('id', buildRecord.id);
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to trigger build', 500, requestId);
      }

      // 10. Update build record with GitHub info
      await supabase.from('agent_builds').update({
        github_run_url: githubActionsUrl,
        build_log: [{ timestamp: new Date().toISOString(), message: `Build triggered via ${result.method}`, url: githubActionsUrl }],
      }).eq('id', buildRecord.id);

      telemetry.completeBuild({ trigger_method: result.method, github_actions_url: githubActionsUrl });

      return new Response(
        JSON.stringify({
          success: true,
          build_id: buildRecord.id,
          status: 'building',
          message: 'Build iniciado. Aguarde 2-3 minutos.',
          estimated_completion: new Date(Date.now() + 180000).toISOString(),
          github_actions_url: githubActionsUrl,
        }),
        { status: 202, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }, { timeoutMs: 25000 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Request timeout') {
      return createTimeoutResponse(buildCorsHeaders(origin));
    }
    logger.error(`[${requestId}] Build request failed`, { error });
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build process failed', 500, requestId);
  }
}, { methods: ['GET', 'POST'] });