// Edge Function: Export Evidence Bundle (Audit-Ready)
// Fase 3: Exportação Audit-Ready (Prova Criptográfica)

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface EvidenceRequest {
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
  agentId?: string; // Optional: filter by specific agent
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant - try user_roles first, then profiles
    let tenantId: string | null = null;

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .single();

    if (userRole?.tenant_id) {
      tenantId = userRole.tenant_id;
    } else {
      // Fallback: get tenant from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();
      
      tenantId = profile?.tenant_id || null;
    }

    if (!tenantId) {
      console.error('No tenant found for user:', user.id);
      return new Response(
        JSON.stringify({ success: false, error: 'No tenant found for this user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body: EvidenceRequest = await req.json();
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

    const bundle: Record<string, unknown> = {
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: user.email,
        tenantId,
        periodStart,
        periodEnd,
        bundleType,
        agentFilter: agentId || null,
      },
      evidence: {},
    };

    let totalRecords = 0;

    // Collect Security Events
    if (options.securityEvents) {
      let query = supabase
        .from('security_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: true });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data: events } = await query;
      bundle.evidence = { ...(bundle.evidence as object), securityEvents: events || [] };
      totalRecords += events?.length || 0;
    }

    // Collect Jobs
    if (options.jobs) {
      let query = supabase
        .from('jobs')
        .select('id, agent_id, agent_name, type, status, created_at, completed_at, result, payload_hash, result_hash, result_signature')
        .eq('tenant_id', tenantId)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: true });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data: jobs } = await query;
      bundle.evidence = { ...(bundle.evidence as object), jobs: jobs || [] };
      totalRecords += jobs?.length || 0;
    }

    // Collect Signed Job Executions
    if (options.signatures) {
      let query = supabase
        .from('job_executions')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('started_at', periodStart)
        .lte('started_at', periodEnd)
        .not('result_signature', 'is', null)
        .order('started_at', { ascending: true });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data: executions } = await query;
      bundle.evidence = { ...(bundle.evidence as object), signedExecutions: executions || [] };
      totalRecords += executions?.length || 0;
    }

    // Collect Hash Chain
    if (options.hashChain && agentId) {
      const { data: chain } = await supabase
        .from('agent_execution_chain')
        .select('*')
        .eq('agent_id', agentId)
        .single();

      bundle.evidence = { ...(bundle.evidence as object), hashChain: chain || null };
      if (chain) totalRecords += 1;
    }

    // Collect Risk Decisions
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

    // Collect Playbook Executions
    if (options.playbookExecutions) {
      let query = supabase
        .from('playbook_executions')
        .select('*, playbooks(name)')
        .eq('tenant_id', tenantId)
        .gte('triggered_at', periodStart)
        .lte('triggered_at', periodEnd)
        .order('triggered_at', { ascending: true });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data: executions } = await query;
      bundle.evidence = { ...(bundle.evidence as object), playbookExecutions: executions || [] };
      totalRecords += executions?.length || 0;
    }

    // Collect Audit Logs
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

    // Generate manifest hash
    const manifestData = JSON.stringify(bundle);
    const manifestHash = await hashData(manifestData);
    const auditId = generateAuditId();

    // Calculate size
    const bundleSize = new TextEncoder().encode(manifestData).length;

    // Save bundle record
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
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save bundle record:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save bundle record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build final response
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
        description: 'Este pacote contém evidências criptograficamente verificáveis de eventos de segurança.',
        howToVerify: [
          `1. Acesse: ${bundleRecord.verification_url}`,
          '2. O sistema verificará a integridade do hash SHA-256',
          '3. Se o hash coincidir, as evidências são autênticas e não foram alteradas',
        ],
        disclaimer: 'Este bundle foi gerado automaticamente pelo CyberShield e contém assinaturas digitais para validação.',
      },
    };

    return new Response(
      JSON.stringify({
        success: true,
        auditId,
        manifestHash,
        verificationUrl: bundleRecord.verification_url,
        recordCount: totalRecords,
        sizeBytes: bundleSize,
        bundle: finalBundle,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
