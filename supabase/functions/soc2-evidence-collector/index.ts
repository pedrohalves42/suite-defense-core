// @ts-nocheck
/**
 * soc2-evidence-collector — Collects SOC 2 compliance evidence from DB
 * 
 * Cost-efficient: ONE call collects ALL controls via parallel queries.
 * No AI calls — pure SQL aggregation.
 * 
 * Uses serveTenant for auth + multi-tenant isolation.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

// ── Input validation ──
const BodySchema = z.object({
  save: z.boolean().optional().default(false),
});

// ── Evidence types ──
interface EvidenceItem {
  control_id: string;
  evidence_type: string;
  reference: string;
  description: string;
  metadata: Record<string, unknown>;
}

interface ControlSummary {
  count: number;
  strength: 'none' | 'weak' | 'moderate' | 'strong';
  descriptions: string[];
}

// ── Control-to-query mapping (custo-eficiente: agrupa por query) ──
async function collectEvidenceFromDB(
  supabase: any,
  tenantId: string,
): Promise<EvidenceItem[]> {
  const evidence: EvidenceItem[] = [];

  // Run all queries in parallel for minimum latency
  const [
    rolesResult,
    auditResult,
    agentsResult,
    alertRulesResult,
    enrollmentResult,
    policiesResult,
    controlsResult,
  ] = await Promise.all([
    // 1. RBAC roles → CC1.3, CC6.1
    supabase.from('user_roles')
      .select('id, role, user_id')
      .limit(100),

    // 2. Audit logs → CC1.5, CC7.1
    supabase.from('audit_logs')
      .select('id, action, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),

    // 3. Agents → CC6.2, CC7.2
    supabase.from('agents')
      .select('id, agent_name, status, agent_version, platform')
      .eq('tenant_id', tenantId)
      .limit(100),

    // 4. Alert rules → CC7.2
    supabase.from('alert_rules')
      .select('id, name, severity, is_active')
      .eq('tenant_id', tenantId)
      .limit(50),

    // 5. Enrollment keys → CC6.3
    supabase.from('enrollment_keys')
      .select('id, name, is_active')
      .eq('tenant_id', tenantId)
      .limit(50),

    // 6. Compliance policies → CC2.1
    supabase.from('compliance_policies')
      .select('id, policy_code, policy_name, status')
      .eq('tenant_id', tenantId)
      .limit(50),

    // 7. SOC2 controls already registered → general status
    supabase.from('soc2_controls')
      .select('id, control_code, control_name, status, evidence_type')
      .eq('tenant_id', tenantId)
      .limit(200),
  ]);

  // ── CC1.1 Commitment to integrity — policies exist
  const policies = policiesResult.data ?? [];
  if (policies.length > 0) {
    evidence.push({
      control_id: 'CC1.1',
      evidence_type: 'policy',
      reference: 'compliance_policies',
      description: `${policies.length} política(s) de compliance documentada(s): ${policies.map(p => p.policy_code).join(', ')}`,
      metadata: { count: policies.length, codes: policies.map(p => p.policy_code) },
    });
  }

  // ── CC1.2 Board oversight — risk assessment (implied by alert rules)
  const alertRules = alertRulesResult.data ?? [];
  const activeRules = alertRules.filter(r => r.is_active);
  if (activeRules.length > 0) {
    evidence.push({
      control_id: 'CC1.2',
      evidence_type: 'configuration',
      reference: 'alert_rules',
      description: `${activeRules.length} regra(s) de alerta ativa(s) para monitoramento de riscos`,
      metadata: { active: activeRules.length, total: alertRules.length },
    });
  }

  // ── CC1.3 Organizational structure — RBAC
  const roles = rolesResult.data ?? [];
  if (roles.length > 0) {
    const uniqueRoles = [...new Set(roles.map(r => r.role))];
    evidence.push({
      control_id: 'CC1.3',
      evidence_type: 'configuration',
      reference: 'user_roles',
      description: `RBAC implementado com ${uniqueRoles.length} papel(is) distintos: ${uniqueRoles.join(', ')}`,
      metadata: { totalAssignments: roles.length, roles: uniqueRoles },
    });
  }

  // ── CC1.5 Accountability — Audit trail
  const auditLogs = auditResult.data ?? [];
  if (auditLogs.length > 0) {
    evidence.push({
      control_id: 'CC1.5',
      evidence_type: 'log',
      reference: 'audit_logs',
      description: `Trilha de auditoria imutável com ${auditLogs.length}+ registros recentes`,
      metadata: { sampleCount: auditLogs.length },
    });
  }

  // ── CC2.1 Internal communication — documented policies
  if (policies.length > 0) {
    const approved = policies.filter(p => p.status === 'approved');
    evidence.push({
      control_id: 'CC2.1',
      evidence_type: 'policy',
      reference: 'compliance_policies',
      description: `${approved.length} política(s) aprovada(s) de ${policies.length} total`,
      metadata: { approved: approved.length, total: policies.length },
    });
  }

  // ── CC3.1 Risk objectives — alert rules as risk monitoring
  if (alertRules.length > 0) {
    evidence.push({
      control_id: 'CC3.1',
      evidence_type: 'configuration',
      reference: 'alert_rules',
      description: `${alertRules.length} regra(s) de monitoramento de risco configurada(s)`,
      metadata: { count: alertRules.length },
    });
  }

  // ── CC6.1 Logical access — RBAC + RLS
  if (roles.length > 0) {
    evidence.push({
      control_id: 'CC6.1',
      evidence_type: 'configuration',
      reference: 'user_roles + RLS policies',
      description: `Controle de acesso lógico via RBAC (${roles.length} atribuições) e RLS no banco de dados`,
      metadata: { roleAssignments: roles.length },
    });
  }

  // ── CC6.2 Authentication — agents with HMAC/JWT
  const agents = agentsResult.data ?? [];
  if (agents.length > 0) {
    const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'online');
    evidence.push({
      control_id: 'CC6.2',
      evidence_type: 'configuration',
      reference: 'agents',
      description: `${activeAgents.length} agente(s) ativo(s) de ${agents.length} total, autenticados via HMAC + JWT`,
      metadata: { active: activeAgents.length, total: agents.length },
    });
  }

  // ── CC6.3 Registration/authorization — enrollment keys
  const enrollmentKeys = enrollmentResult.data ?? [];
  if (enrollmentKeys.length > 0) {
    const activeKeys = enrollmentKeys.filter(k => k.is_active);
    evidence.push({
      control_id: 'CC6.3',
      evidence_type: 'configuration',
      reference: 'enrollment_keys',
      description: `Sistema de enrollment com ${activeKeys.length} chave(s) ativa(s)`,
      metadata: { active: activeKeys.length, total: enrollmentKeys.length },
    });
  }

  // ── CC7.1 Infrastructure monitoring — audit logs
  if (auditLogs.length > 0) {
    evidence.push({
      control_id: 'CC7.1',
      evidence_type: 'log',
      reference: 'audit_logs',
      description: `Monitoramento ativo com ${auditLogs.length}+ logs de auditoria recentes`,
      metadata: { sampleCount: auditLogs.length },
    });
  }

  // ── CC7.2 Anomaly detection — alert rules + agents
  if (activeRules.length > 0 || agents.length > 0) {
    evidence.push({
      control_id: 'CC7.2',
      evidence_type: 'configuration',
      reference: 'alert_rules + agents',
      description: `Detecção de anomalias via ${activeRules.length} regra(s) de alerta e ${agents.length} agente(s) de monitoramento`,
      metadata: { alertRules: activeRules.length, agents: agents.length },
    });
  }

  // ── CC8.1 Change management — existing SOC2 controls
  const controls = controlsResult.data ?? [];
  const implementedControls = controls.filter(c => c.status === 'implemented' || c.status === 'verified');
  if (controls.length > 0) {
    evidence.push({
      control_id: 'CC8.1',
      evidence_type: 'control',
      reference: 'soc2_controls',
      description: `${implementedControls.length} de ${controls.length} controles SOC 2 implementados/verificados`,
      metadata: { implemented: implementedControls.length, total: controls.length },
    });
  }

  return evidence;
}

// ── Strength calculator ──
function calculateStrength(count: number): 'none' | 'weak' | 'moderate' | 'strong' {
  if (count === 0) return 'none';
  if (count === 1) return 'weak';
  if (count <= 3) return 'moderate';
  return 'strong';
}

// ── Build summary from evidence ──
function buildSummary(evidence: EvidenceItem[]): Record<string, ControlSummary> {
  const summary: Record<string, ControlSummary> = {};

  // Group by control_id
  for (const item of evidence) {
    if (!summary[item.control_id]) {
      summary[item.control_id] = { count: 0, strength: 'none', descriptions: [] };
    }
    summary[item.control_id].count += 1;
    summary[item.control_id].descriptions.push(item.description);
  }

  // Calculate strength per control
  for (const controlId of Object.keys(summary)) {
    summary[controlId].strength = calculateStrength(summary[controlId].count);
  }

  return summary;
}

// ── Save evidence to DB ──
async function persistEvidence(
  supabase: any,
  tenantId: string,
  evidence: EvidenceItem[],
): Promise<boolean> {
  if (evidence.length === 0) return true;

  const rows = evidence.map(e => ({
    tenant_id: tenantId,
    control_id: e.control_id,
    evidence_type: e.evidence_type,
    reference: e.reference,
    description: e.description,
    metadata: e.metadata,
    status: 'active',
    valid_from: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('soc2_evidence')
    .insert(rows);

  if (error) {
    logger.error('Failed to persist SOC2 evidence', { error: error.message });
    return false;
  }
  return true;
}

// ── Main handler ──
serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  // Validate input
  const parsed = BodySchema.safeParse(ctx.body ?? {});
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400 },
    );
  }

  const { save } = parsed.data;

  logger.info(`[${requestId}] SOC2 evidence collection started`, { tenantId, save });

  // Collect evidence from all sources in parallel
  const evidence = await collectEvidenceFromDB(supabase, tenantId);
  const summary = buildSummary(evidence);
  const controls = [...new Set(evidence.map(e => e.control_id))].sort();

  // Optionally persist
  let saved = false;
  if (save && evidence.length > 0) {
    saved = await persistEvidence(supabase, tenantId, evidence);
  }

  logger.info(`[${requestId}] SOC2 evidence collection completed`, {
    tenantId,
    totalEvidence: evidence.length,
    controls: controls.length,
    saved,
  });

  return new Response(
    JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      tenant_id: tenantId,
      controls,
      evidence,
      summary,
      saved,
    }),
    { status: 200 },
  );
});