import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { loggerWithContext } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Controls mapped in Phase 1
const PHASE1_CONTROLS = ['CC1.1', 'CC1.2', 'CC1.3', 'CC1.4', 'CC1.5'] as const;

interface EvidenceItem {
  control_id: string;
  evidence_type: string;
  reference: string;
  description: string;
  metadata: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const log = loggerWithContext({ requestId });

  try {
    // Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get tenant from request or JWT
    const tenantId = req.headers.get('x-tenant-id') || user.app_metadata?.active_tenant_id;
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Tenant not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user belongs to tenant with admin/compliance role
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userRole || !['admin', 'super_admin', 'compliance_officer', 'owner'].includes(userRole.role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions. Requires admin or compliance role.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info('Starting SOC 2 evidence collection', { tenantId, userId: user.id });

    // Collect evidence for each control
    const evidence: EvidenceItem[] = [];

    // CC1.1 — Commitment to integrity (policies)
    const cc11 = await collectCC11(supabaseAdmin, tenantId);
    evidence.push(...cc11);

    // CC1.2 — Board oversight (risk assessment)
    const cc12 = await collectCC12(supabaseAdmin, tenantId);
    evidence.push(...cc12);

    // CC1.3 — Organizational structure (RBAC)
    const cc13 = await collectCC13(supabaseAdmin, tenantId);
    evidence.push(...cc13);

    // CC1.4 — Competence (training)
    const cc14 = await collectCC14(supabaseAdmin, tenantId);
    evidence.push(...cc14);

    // CC1.5 — Accountability (audit trail)
    const cc15 = await collectCC15(supabaseAdmin, tenantId);
    evidence.push(...cc15);

    // Parse body for save option
    let saveToDb = false;
    try {
      const body = await req.json();
      saveToDb = body?.save === true;
    } catch { /* no body or not JSON */ }

    // Optionally persist evidence
    if (saveToDb) {
      const rows = evidence.map(e => ({
        tenant_id: tenantId,
        control_id: e.control_id,
        evidence_type: e.evidence_type,
        reference: e.reference,
        description: e.description,
        metadata: e.metadata,
        status: 'active',
        hash: '', // will be computed below
      }));

      // Compute SHA-256 hashes
      for (const row of rows) {
        const data = new TextEncoder().encode(JSON.stringify({ ...row, hash: undefined }));
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        row.hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      // Expire previous active evidence for these controls
      await supabaseAdmin
        .from('soc2_evidence')
        .update({ status: 'superseded', valid_until: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .in('control_id', PHASE1_CONTROLS as unknown as string[]);

      const { error: insertError } = await supabaseAdmin
        .from('soc2_evidence')
        .insert(rows);

      if (insertError) {
        log.error('Failed to save evidence', insertError);
      } else {
        log.success(`Saved ${rows.length} evidence records`);
      }
    }

    // Build summary per control
    const summary: Record<string, { count: number; strength: 'none' | 'weak' | 'moderate' | 'strong'; descriptions: string[] }> = {};
    for (const controlId of PHASE1_CONTROLS) {
      const controlEvidence = evidence.filter(e => e.control_id === controlId);
      const count = controlEvidence.length;
      const strength = count === 0 ? 'none' : count <= 1 ? 'weak' : count <= 3 ? 'moderate' : 'strong';
      summary[controlId] = {
        count,
        strength,
        descriptions: controlEvidence.map(e => e.description),
      };
    }

    log.timed('Evidence collection completed', { totalEvidence: evidence.length });

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      tenant_id: tenantId,
      controls: PHASE1_CONTROLS,
      evidence,
      summary,
      saved: saveToDb,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    log.error('Evidence collection failed', err);
    return new Response(JSON.stringify({ error: 'Internal error during evidence collection' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Collectors ────────────────────────────────────────────────

async function collectCC11(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];

  // Check approved compliance policies
  const { data: policies, count } = await supabase
    .from('compliance_policies')
    .select('id, title, status, policy_code', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('status', 'approved')
    .limit(10);

  if (count && count > 0) {
    items.push({
      control_id: 'CC1.1',
      evidence_type: 'policy',
      reference: 'compliance_policies (approved)',
      description: `${count} política(s) aprovada(s) demonstram compromisso com integridade. Exemplos: ${(policies || []).slice(0, 3).map(p => p.title || p.policy_code).join(', ')}.`,
      metadata: { total_approved: count, sample_policies: policies?.slice(0, 3) },
    });
  }

  // Check if ISP (Information Security Policy) exists
  const { data: isp } = await supabase
    .from('compliance_policies')
    .select('id, title, status')
    .eq('tenant_id', tenantId)
    .ilike('policy_code', '%ISP%')
    .maybeSingle();

  if (isp) {
    items.push({
      control_id: 'CC1.1',
      evidence_type: 'policy',
      reference: `compliance_policies/${isp.id}`,
      description: `Política de Segurança da Informação (ISP) encontrada: "${isp.title}" com status "${isp.status}".`,
      metadata: { policy: isp },
    });
  }

  return items;
}

async function collectCC12(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];

  // Check risk assessments / vendor risk registry
  const { count: vendorCount } = await supabase
    .from('vendor_risk_registry')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (vendorCount && vendorCount > 0) {
    items.push({
      control_id: 'CC1.2',
      evidence_type: 'database',
      reference: 'vendor_risk_registry',
      description: `${vendorCount} fornecedor(es) registrado(s) no registro de risco de terceiros, demonstrando supervisão de riscos.`,
      metadata: { vendor_count: vendorCount },
    });
  }

  // Check security events for monitoring
  const { count: eventCount } = await supabase
    .from('security_events')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (eventCount && eventCount > 0) {
    items.push({
      control_id: 'CC1.2',
      evidence_type: 'log',
      reference: 'security_events',
      description: `${eventCount} evento(s) de segurança registrado(s), demonstrando monitoramento ativo.`,
      metadata: { event_count: eventCount },
    });
  }

  return items;
}

async function collectCC13(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];

  // Count distinct roles
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('tenant_id', tenantId);

  const distinctRoles = [...new Set((roles || []).map(r => r.role))];
  const totalUsers = (roles || []).length;

  if (totalUsers > 0) {
    items.push({
      control_id: 'CC1.3',
      evidence_type: 'database',
      reference: 'user_roles',
      description: `RBAC implementado com ${distinctRoles.length} papel(éis) distintos (${distinctRoles.join(', ')}) atribuídos a ${totalUsers} usuário(s).`,
      metadata: { distinct_roles: distinctRoles, total_assignments: totalUsers },
    });
  }

  // Check SOC 2 criteria/controls in database
  const { count: criteriaCount } = await supabase
    .from('soc2_criteria')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (criteriaCount && criteriaCount > 0) {
    items.push({
      control_id: 'CC1.3',
      evidence_type: 'config',
      reference: 'soc2_criteria',
      description: `${criteriaCount} critério(s) SOC 2 definido(s) no sistema com controles associados, demonstrando estrutura organizacional de conformidade.`,
      metadata: { criteria_count: criteriaCount },
    });
  }

  return items;
}

async function collectCC14(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];

  // Check if training policy exists
  const { data: trainingPolicy } = await supabase
    .from('compliance_policies')
    .select('id, title, status')
    .eq('tenant_id', tenantId)
    .ilike('policy_code', '%SAT%')
    .maybeSingle();

  if (trainingPolicy) {
    items.push({
      control_id: 'CC1.4',
      evidence_type: 'policy',
      reference: `compliance_policies/${trainingPolicy.id}`,
      description: `Política de Conscientização em Segurança (SAT) encontrada: "${trainingPolicy.title}" com status "${trainingPolicy.status}".`,
      metadata: { policy: trainingPolicy },
    });
  }

  // Check active sessions as indicator of user engagement
  const { count: activeUsers } = await supabase
    .from('active_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (activeUsers && activeUsers > 0) {
    items.push({
      control_id: 'CC1.4',
      evidence_type: 'log',
      reference: 'active_sessions',
      description: `${activeUsers} sessão(ões) ativa(s) demonstram engajamento dos usuários com o sistema de segurança.`,
      metadata: { active_sessions: activeUsers },
    });
  }

  return items;
}

async function collectCC15(supabase: ReturnType<typeof createClient>, tenantId: string): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];

  // Check audit logs
  const { count: auditCount } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (auditCount && auditCount > 0) {
    items.push({
      control_id: 'CC1.5',
      evidence_type: 'log',
      reference: 'audit_logs',
      description: `${auditCount} registro(s) de auditoria imutável(éis) demonstram trilha de responsabilização (accountability).`,
      metadata: { audit_log_count: auditCount },
    });
  }

  // Check agent evidence logs (immutable chain)
  const { count: evidenceCount } = await supabase
    .from('agent_evidence_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (evidenceCount && evidenceCount > 0) {
    items.push({
      control_id: 'CC1.5',
      evidence_type: 'log',
      reference: 'agent_evidence_logs',
      description: `${evidenceCount} log(s) de evidência de agente com hash de integridade, formando cadeia imutável de auditoria.`,
      metadata: { evidence_log_count: evidenceCount },
    });
  }

  // Check archive events for lifecycle tracking
  const { count: archiveCount } = await supabase
    .from('agent_archive_events')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (archiveCount && archiveCount > 0) {
    items.push({
      control_id: 'CC1.5',
      evidence_type: 'log',
      reference: 'agent_archive_events',
      description: `${archiveCount} evento(s) de arquivamento registrado(s), demonstrando rastreabilidade do ciclo de vida.`,
      metadata: { archive_event_count: archiveCount },
    });
  }

  return items;
}
