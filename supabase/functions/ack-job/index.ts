/**
 * ack-job — DEPRECATED (Sunset 2026-06-01). Use /submit-job-result instead.
 * Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { JobIdSchema } from '../_shared/validation.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (req, ctx) => {
  const { supabase, agentName, requestId, body: rawBody } = ctx;

  logger.warn('[ack-job] DEPRECATED: Sunset 2026-06-01. Use /submit-job-result instead.');

  // Extract job_id from URL or body
  const url = new URL(req.url);
  const jobIdFromUrl = url.pathname.split('/').pop();

  let jobId: string | null = null;
  if (jobIdFromUrl && jobIdFromUrl !== 'ack-job') {
    jobId = jobIdFromUrl;
  }
  if (!jobId) {
    const bodyObj = rawBody as Record<string, unknown>;
    jobId = (bodyObj?.job_id as string) || null;
  }

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: 'job_id ausente (esperado na URL ou body)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const jobIdValidation = JobIdSchema.safeParse(jobId);
  if (!jobIdValidation.success) {
    return new Response(
      JSON.stringify({ error: 'Formato de job ID invalido' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const validatedJobId = jobIdValidation.data;
  logger.info('[ACK] Job:', validatedJobId, 'por agente:', agentName);

  // Fetch job to validate
  const { data: existingJob, error: fetchError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', validatedJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !existingJob) {
    return new Response(
      JSON.stringify({ error: 'Job nao encontrado' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify job belongs to this agent
  if (existingJob.agent_name !== agentName) {
    return new Response(
      JSON.stringify({ error: 'Job pertence a outro agente' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Idempotency
  if (existingJob.status === 'done') {
    return {
      ok: true,
      message: 'Job ja estava confirmado (v1 - DEPRECATED)',
      deprecation_warning: 'This endpoint will be removed. Use submit-job-result',
    };
  }

  // Update job status
  const { error: updateError } = await supabase
    .from('jobs')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', validatedJobId)
    .eq('agent_name', agentName);

  if (updateError) {
    logger.error('[ACK] Erro ao atualizar job:', updateError);
    return new Response(
      JSON.stringify({ error: 'Erro ao atualizar job' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info('[ACK] Job confirmado com sucesso:', validatedJobId);

  return {
    ok: true,
    message: 'Job acknowledged (v1 - DEPRECATED)',
    deprecation_warning: 'This endpoint will be removed on 2026-06-01. Migrate to submit-job-result',
  };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'ack-job', maxRequests: 60, windowMinutes: 1, blockMinutes: 5 },
});
