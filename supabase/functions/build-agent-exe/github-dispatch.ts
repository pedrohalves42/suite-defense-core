import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { BuildTelemetry } from '../_shared/build-telemetry.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

export interface GitHubConfig {
  token: string;
  repository: string;
}

export interface WorkflowPayload {
  ps1_content_base64: string;
  output_name: string;
  version: string;
  build_id: string;
  callback_url: string;
  callback_token: string;
}

interface DispatchResult {
  success: boolean;
  method: string;
  error?: string;
  attempts: number;
}

/**
 * Validate GitHub API connectivity.
 */
export async function validateGitHubAccess(
  config: GitHubConfig,
  requestId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const testResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${config.repository}/actions/workflows`,
      { headers: { Authorization: `Bearer ${config.token}` } }
    );
    if (!testResponse.ok) {
      return { ok: false, error: `GitHub API unreachable: ${testResponse.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `GitHub API error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Try repository_dispatch with exponential backoff, then fallback to workflow_dispatch.
 */
export async function dispatchBuild(
  config: GitHubConfig,
  payload: WorkflowPayload,
  installerContent: string,
  requestId: string,
  telemetry: BuildTelemetry | null
): Promise<DispatchResult> {
  const maxRetries = 3;
  const retryDelays = [2000, 4000, 8000];
  let lastError = '';

  // --- repository_dispatch ---
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    telemetry?.startStep(`github_dispatch_attempt_${attempt}`, { attempt, max_retries: maxRetries });

    try {
      const dispatchUrl = `https://api.github.com/repos/${config.repository}/dispatches`;
      logger.info(`[${requestId}] repository_dispatch attempt ${attempt}/${maxRetries}`);

      const resp = await fetchWithTimeout(dispatchUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'CyberShield-Agent-Builder',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ event_type: 'build-agent-exe', client_payload: payload }),
      });

      if (resp.ok || resp.status === 204) {
        telemetry?.completeStep(`github_dispatch_attempt_${attempt}`, { success: true, status_code: resp.status });
        return { success: true, method: 'repository_dispatch', attempts: attempt };
      }

      const errorText = await resp.text();
      lastError = `Status ${resp.status}: ${errorText}`;
      logger.error(`[${requestId}] dispatch failed`, { status: resp.status, body: errorText });

      // Don't retry on 4xx client errors
      if (resp.status >= 400 && resp.status < 500) break;

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt - 1]));
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      telemetry?.failStep(`github_dispatch_attempt_${attempt}`, lastError);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt - 1]));
      }
    }
  }

  // --- workflow_dispatch fallback ---
  telemetry?.startStep('workflow_dispatch_fallback');
  try {
    const workflowUrl = `https://api.github.com/repos/${config.repository}/actions/workflows/build-agent-exe.yml/dispatches`;
    const resp = await fetchWithTimeout(workflowUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          ps1_content: installerContent,
          output_name: payload.output_name,
          version: payload.version,
          build_id: payload.build_id,
          callback_url: payload.callback_url,
          callback_token: payload.callback_token,
        },
      }),
    });

    if (resp.ok || resp.status === 204) {
      telemetry?.completeStep('workflow_dispatch_fallback', { success: true });
      return { success: true, method: 'workflow_dispatch', attempts: maxRetries + 1 };
    }

    const errText = await resp.text();
    telemetry?.failStep('workflow_dispatch_fallback', `Status ${resp.status}: ${errText}`);
    lastError = errText;
  } catch (err) {
    telemetry?.failStep('workflow_dispatch_fallback', err instanceof Error ? err : String(err));
    lastError = err instanceof Error ? err.message : String(err);
  }

  return { success: false, method: 'none', error: lastError, attempts: maxRetries + 1 };
}
