/**
 * Build operations handlers — inlined from standalone functions (Phase 2E).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

type SB = any;

/** build-callback: Receives build results from CI/CD pipeline */
export async function handleBuildCallback(
  supabase: SB, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const buildId = payload.build_id as string;
  const exeBase64 = payload.exe_binary_base64 as string | undefined;
  const sha256 = payload.sha256 as string | undefined;
  const sizeBytes = payload.size_bytes as number | undefined;
  const githubRunId = payload.github_run_id as string | undefined;
  const error = payload.error as string | undefined;

  if (!buildId || typeof buildId !== 'string') {
    return { error: 'build_id (UUID) required', __status: 400 };
  }

  if (error) {
    await supabase.from('agent_builds').update({
      build_status: 'failed', error_message: error,
      github_run_id: githubRunId || null,
      build_completed_at: new Date().toISOString(),
    }).eq('id', buildId);
    logger.error(`[${requestId}] Build failed`, { buildId, error });
    return { success: false };
  }

  if (!exeBase64) return { error: 'exe_binary_base64 required when no error', __status: 400 };

  const exeBuffer = Uint8Array.from(atob(exeBase64), c => c.charCodeAt(0));
  const { data: buildData } = await supabase
    .from('agent_builds')
    .select('tenant_id, build_started_at, agents!inner(agent_name)')
    .eq('id', buildId).single();

  if (!buildData) return { success: false, error: 'Build not found', __status: 404 };

  const agentName = (buildData.agents as Record<string, unknown>)?.agent_name;
  if (!agentName) return { success: false, error: 'Agent not found', __status: 500 };

  const storagePath = `${buildData.tenant_id}/${agentName}-${Date.now()}.exe`;
  const { error: uploadError } = await supabase.storage
    .from('agent-installers')
    .upload(storagePath, exeBuffer, { contentType: 'application/octet-stream', upsert: true });

  if (uploadError) {
    await supabase.from('agent_builds').update({
      build_status: 'failed', error_message: 'Failed to upload EXE',
      build_completed_at: new Date().toISOString(),
    }).eq('id', buildId);
    return { success: false, error: 'Upload failed', __status: 500 };
  }

  const { data: downloadUrlData } = await supabase.storage
    .from('agent-installers').createSignedUrl(storagePath, 86400);
  if (!downloadUrlData) return { success: false, error: 'URL generation failed', __status: 500 };

  const duration = Math.floor((Date.now() - new Date(buildData.build_started_at).getTime()) / 1000);
  await supabase.from('agent_builds').update({
    build_status: 'completed', build_completed_at: new Date().toISOString(),
    build_duration_seconds: duration, file_path: storagePath,
    file_size_bytes: sizeBytes || 0, sha256_hash: sha256 || null,
    download_url: downloadUrlData.signedUrl,
    download_expires_at: new Date(Date.now() + 86400000).toISOString(),
    github_run_id: githubRunId || null,
  }).eq('id', buildId);

  logger.info(`[${requestId}] Build completed`, { buildId, duration_seconds: duration });
  return { success: true };
}
