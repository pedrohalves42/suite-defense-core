import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface EvidenceRequest {
  tenant_id?: string;
  periodStart: string;
  periodEnd: string;
  bundleType: 'incident' | 'compliance' | 'audit' | 'custom';
  includeOptions?: {
    securityEvents?: boolean;
    jobs?: boolean;
    signatures?: boolean;
    hashChain?: boolean;
    riskDecisions?: boolean;
    playbookExecutions?: boolean;
    auditLogs?: boolean;
  };
  agentId?: string;
}

function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `AUD-${timestamp}-${random}`.toUpperCase();
}

async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serveTenant<EvidenceRequest>(async (_req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;
  const { periodStart, periodEnd, bundleType, includeOptions, agentId } = body;

  if (!periodStart || !periodEnd) {
    return new Response(
      JSON.stringify({ success: false, error: 'periodStart and periodEnd are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const options = {
    securityEvents: true,
    jobs: true,
    signatures: true,
    hashChain: true,
    riskDecisions: true,
    playbookExecutions: true,
    auditLogs: true,
    ...includeOptions,
  };

  // Get user email for metadata
  let userEmail = 'system';
  if (userId) {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    userEmail = user?.email || 'unknown';
  }

  const bundle: Record<string, unknown> = {
    metadata: {
      generatedAt: new Date().toISOString(),
      generatedBy: userEmail,
      tenantId,
      periodStart,
      periodEnd,
      bundleType,
      agentFilter: agentId || null,
    },
    evidence: {},
  };

  let totalRecords = 0;

  if (options.securityEvents) {
    let query = supabase
      .from('security_events')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .order('created_at', { ascending: true });
    if (agentId) query = query.eq('agent_id', agentId);
    const { data: events } = await query;
    bundle.evidence = { ...(bundle.evidence as object), securityEvents: events || [] };
    totalRecords += events?.length || 0;
  }

  if (options.jobs) {
    let query = supabase
      .from('jobs')
      .select('id, agent_id, agent_name, type, status, created_at, completed_at, result, payload_hash, result_hash, result_signature')
      .eq('tenant_id', tenantId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .order('created_at', { ascending: true });
    if (agentId) query = query.eq('agent_id', agentId);
    const { data: jobs } = await query;
    bundle.evidence = { ...(bundle.evidence as object), jobs: jobs || [] };
    totalRecords += jobs?.length || 0;
  }

  if (options.signatures) {
    let query = supabase
      .from('job_executions')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('started_at', periodStart)
      .lte('started_at', periodEnd)
      .not('result_signature', 'is', null)
      .order('started_at', { ascending: true });
    if (agentId) query = query.eq('agent_id', agentId);
    const { data: executions } = await query;
    bundle.evidence = { ...(bundle.evidence as object), signedExecutions: executions || [] };
    totalRecords += executions?.length || 0;
  }

  if (options.hashChain && agentId) {
    const { data: chain } = await supabase
      .from('agent_execution_chain')
      .select('*')
      .eq('agent_id', agentId)
      .single();
    bundle.evidence = { ...(bundle.evidence as object), hashChain: chain || null };
    if (chain) totalRecords += 1;
  }

  if (options.riskDecisions) {
    const { data: decisions } = await supabase
      .from('risk_decision_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .order('created_at', { ascending: true });
    bundle.evidence = { ...(bundle.evidence as object), riskDecisions: decisions || [] };
    totalRecords += decisions?.length || 0;
  }

  if (options.playbookExecutions) {
    let query = supabase
      .from('playbook_executions')
      .select('*, playbooks(name)')
      .eq('tenant_id', tenantId)
      .gte('triggered_at', periodStart)
      .lte('triggered_at', periodEnd)
      .order('triggered_at', { ascending: true });
    if (agentId) query = query.eq('agent_id', agentId);
    const { data: executions } = await query;
    bundle.evidence = { ...(bundle.evidence as object), playbookExecutions: executions || [] };
    totalRecords += executions?.length || 0;
  }

  if (options.auditLogs) {
    const { data: logs } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd)
      .order('created_at', { ascending: true });
    bundle.evidence = { ...(bundle.evidence as object), auditLogs: logs || [] };
    totalRecords += logs?.length || 0;
  }

  const manifestData = JSON.stringify(bundle);
  const manifestHash = await hashData(manifestData);
  const auditId = generateAuditId();
  const bundleSize = new TextEncoder().encode(manifestData).length;

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

  const { data: bundleRecord, error: insertError } = await supabase
    .from('evidence_bundles')
    .insert({
      tenant_id: tenantId,
      audit_id: auditId,
      bundle_type: bundleType,
      period_start: periodStart,
      period_end: periodEnd,
      manifest_hash: manifestHash,
      included_evidence: options,
      file_count: totalRecords,
      total_size_bytes: bundleSize,
      verification_url: `${SUPABASE_URL}/functions/v1/verify-document?audit_id=${auditId}`,
      created_by: userId,
    })
    .select()
    .single();

  if (insertError) {
    logger.error(`[export-evidence-bundle][${requestId}] Failed to save bundle:`, insertError);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to save bundle record' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const finalBundle = {
    ...bundle,
    manifest: {
      auditId,
      manifestHash,
      verificationUrl: bundleRecord.verification_url,
      recordCount: totalRecords,
      sizeBytes: bundleSize,
      generatedAt: new Date().toISOString(),
    },
    readme: {
      title: 'CyberShield Evidence Bundle',
      description: 'Este pacote contem evidencias criptograficamente verificaveis de eventos de seguranca.',
      howToVerify: [
        `1. Acesse: ${bundleRecord.verification_url}`,
        '2. O sistema verificara a integridade do hash SHA-256',
        '3. Se o hash coincidir, as evidencias sao autenticas e nao foram alteradas',
      ],
      disclaimer: 'Este bundle foi gerado automaticamente pelo CyberShield e contem assinaturas digitais para validacao.',
    },
  };

  return {
    success: true,
    auditId,
    manifestHash,
    verificationUrl: bundleRecord.verification_url,
    recordCount: totalRecords,
    sizeBytes: bundleSize,
    bundle: finalBundle,
  };
});
