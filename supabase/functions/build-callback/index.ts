/**
 * build-callback → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const BuildCallbackSchema = z.object({
  build_id: z.string().uuid(),
  exe_binary_base64: z.string().max(200_000_000).optional(),
  sha256: z.string().max(128).optional(),
  size_bytes: z.number().int().min(0).optional(),
  github_run_id: z.string().max(100).optional(),
  error: z.string().max(5000).optional(),
});

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = BuildCallbackSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { build_id, exe_binary_base64, sha256, size_bytes, github_run_id, error } = parsed.data;

  logger.info(`[${requestId}] Build callback received`, { build_id, has_error: !!error });

  if (error) {
    await supabase.from('agent_builds').update({ build_status: 'failed', error_message: error as string, github_run_id: github_run_id as string, build_completed_at: new Date().toISOString() }).eq('id', build_id);
    logger.error(`[${requestId}] Build failed`, { build_id, error });
    return { success: false };
  }

  const exeBuffer = Uint8Array.from(atob(exe_binary_base64 as string), c => c.charCodeAt(0));
  const { data: buildData } = await supabase.from('agent_builds').select('tenant_id, build_started_at, agents!inner(agent_name)').eq('id', build_id).single();

  if (!buildData) {
    logger.error(`[${requestId}] Build record not found`, { build_id });
    return new Response(JSON.stringify({ success: false, error: 'Build not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const agentName = (buildData.agents as Record<string, unknown>)?.agent_name;
  if (!agentName) return new Response(JSON.stringify({ success: false, error: 'Agent not found' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const storagePath = `${buildData.tenant_id}/${agentName}-${Date.now()}.exe`;
  logger.info(`[${requestId}] Uploading EXE`, { build_id, storagePath, size_bytes });

  const { error: uploadError } = await supabase.storage.from('agent-installers').upload(storagePath, exeBuffer, { contentType: 'application/octet-stream', upsert: true });
  if (uploadError) {
    await supabase.from('agent_builds').update({ build_status: 'failed', error_message: 'Failed to upload EXE', build_completed_at: new Date().toISOString() }).eq('id', build_id);
    return new Response(JSON.stringify({ success: false, error: 'Upload failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const { data: downloadUrlData } = await supabase.storage.from('agent-installers').createSignedUrl(storagePath, 86400);
  if (!downloadUrlData) return new Response(JSON.stringify({ success: false, error: 'URL generation failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const duration = Math.floor((Date.now() - new Date(buildData.build_started_at).getTime()) / 1000);
  await supabase.from('agent_builds').update({ build_status: 'completed', build_completed_at: new Date().toISOString(), build_duration_seconds: duration, file_path: storagePath, file_size_bytes: size_bytes as number, sha256_hash: sha256 as string, download_url: downloadUrlData.signedUrl, download_expires_at: new Date(Date.now() + 86400000).toISOString(), github_run_id: github_run_id as string }).eq('id', build_id);

  logger.info(`[${requestId}] Build completed`, { build_id, duration_seconds: duration });
  return { success: true };
});
