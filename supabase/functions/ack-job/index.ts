// @ts-nocheck
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
    .select('id, agent_id, agent_name, tenant_id, type, status, payload, created_at, expires_at')
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

  // Correção F-005: Bloquear encerramento de jobs críticos via endpoint legado (ack-job)
  const CRITICAL_JOB_TYPES = ['security_scan', 'software_inventory', 'web_activity', 'collect_web_activity', 'scan_vulnerabilities'];
  if (CRITICAL_JOB_TYPES.includes(existingJob.type)) {
    logger.error(`[ACK_BYPASS_ATTEMPT] Bloqueada tentativa de finalizar job crítico ${existingJob.type} via ack-job legado. Agente: ${agentName}`);
    return new Response(
      JSON.stringify({ 
        error: 'INTEGRITY_VIOLATION', 
        message: `Jobs do tipo ${existingJob.type} devem usar /submit-job-result para garantir a integridade da telemetria.` 
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
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
  if (existingJob.status === 'completed') {
    return {
      ok: true,
      message: 'Job ja estava confirmado (v1 - DEPRECATED)',
      deprecation_warning: 'This endpoint will be removed. Use submit-job-result',
    };
  }

  // S-P0.5 — Evidência de auditoria/rollback: hash determinístico do ack
  const completedAt = new Date().toISOString();
  const statusBefore = existingJob.status as string;
  const evidencePayload = {
    job_id: validatedJobId,
    agent_name: agentName,
    tenant_id: existingJob.tenant_id,
    job_type: existingJob.type,
    status_before: statusBefore,
    status_after: 'completed',
    completed_at: completedAt,
    request_id: requestId,
    endpoint: 'ack-job',
    endpoint_version: 'v1-deprecated',
  };
  const evidenceJson = JSON.stringify(evidencePayload);
  const evidenceHashBuf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(evidenceJson),
  );
  const evidenceHash = Array.from(new Uint8Array(evidenceHashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Update job status
  const { error: updateError } = await supabase
    .from('jobs')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', validatedJobId)
    .eq('agent_name', agentName);

  if (updateError) {
    logger.error('[ACK] Erro ao atualizar job:', updateError);
    return new Response(
      JSON.stringify({ error: 'Erro ao atualizar job' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Registrar evidência imutável (best-effort: não falha o ack se o insert falhar)
  const { error: evidenceError } = await supabase
    .from('agent_evidence_logs')
    .insert({
      tenant_id: existingJob.tenant_id,
      agent_id: existingJob.agent_id,
      agent_name: agentName,
      event_type: 'job_ack_legacy',
      event_data: evidencePayload,
      evidence_hash: evidenceHash,
      state_before: statusBefore,
      state_after: 'completed',
      severity: 'info',
      trace_id: requestId,
    });

  if (evidenceError) {
    logger.error('[ACK] Falha ao registrar evidência (não-fatal):', evidenceError);
  }

  logger.info('[ACK] Job confirmado com sucesso:', validatedJobId, 'evidence:', evidenceHash.slice(0, 12));

  return {
    ok: true,
    message: 'Job acknowledged (v1 - DEPRECATED)',
    evidence_hash: evidenceHash,
    deprecation_warning: 'This endpoint will be removed on 2026-06-01. Migrate to submit-job-result',
  };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'ack-job', maxRequests: 60, windowMinutes: 1, blockMinutes: 5 },
});
