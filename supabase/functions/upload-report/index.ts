/**
 * upload-report — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { UploadReportSchemaEnhanced, validateFileSize } from '../_shared/validation.ts';
import { handleException, handleValidationError } from '../_shared/error-handler.ts';
import { logSecurityEvent, extractIpAddress } from '../_shared/security-log.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (req, ctx) => {
  const { supabase, agentName, tenantId, requestId, body } = ctx;

  const contentType = req.headers.get('content-type') || '';

  let sanitizedKind: string;
  let sanitizedFilename: string;
  let fileContent: string;

  if (contentType.includes('application/json')) {
    const { job_id, result, timestamp } = body as Record<string, unknown>;

    if (!job_id || !result) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatorios faltando (job_id, result)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    sanitizedKind = 'job_result';
    sanitizedFilename = `job-${job_id}-${Date.now()}.json`;
    fileContent = JSON.stringify({ job_id, result, timestamp: timestamp || new Date().toISOString(), agent: agentName }, null, 2);
  } else {
    // Multipart form - need to re-read request
    // NOTE: When hmacVerify is true, body was parsed from rawBody.
    // For multipart, we need to handle differently - use the original req clone.
    const formData = await req.formData();
    const kind = formData.get('kind') as string;
    const file = formData.get('file') as File;

    if (!kind || !file) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatorios faltando (kind, file)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const validation = UploadReportSchemaEnhanced.safeParse({ kind, filename: file.name });
    if (!validation.success) {
      const ipAddress = extractIpAddress(req);
      await logSecurityEvent({
        supabase, tenantId, ipAddress, endpoint: 'upload-report',
        attackType: 'invalid_input', severity: 'medium', blocked: true,
        details: { errors: validation.error.issues, kind, filename: file.name },
        userAgent: req.headers.get('user-agent') || undefined, requestId,
      });
      return handleValidationError(validation.error, requestId);
    }

    if (!validateFileSize(file.size)) {
      return new Response(JSON.stringify({ error: 'Arquivo muito grande (maximo 10MB)' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
    }

    sanitizedFilename = validation.data.filename;
    sanitizedKind = validation.data.kind;
    fileContent = await file.text();
  }

  const { data: report, error } = await supabase
    .from('reports')
    .insert({ agent_name: agentName, tenant_id: tenantId, kind: sanitizedKind, file_path: sanitizedFilename, file_data: fileContent })
    .select()
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return new Response(
    JSON.stringify({ id: report.id, kind: report.kind, agentName: report.agent_name, createdUtc: report.created_at, file: report.file_path }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'upload-report', maxRequests: 10, windowMinutes: 1, blockMinutes: 10 },
});
