/**
 * Evaluate Software Risk - Migrated to servePublic
 * Evaluates software against vulnerability baselines.
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const InputSchema = z.object({
  agent_id: z.string().uuid().optional(),
  software_list: z.array(z.object({
    name: z.string(), version: z.string(), vendor: z.string().optional(),
  })).optional(),
});

interface VulnerabilityBaseline {
  id: string; software_name: string; software_name_patterns: string[];
  vendor: string; min_safe_version: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cve_refs: string[]; impact: string; remediation: string; action: string;
}

interface SoftwareRisk {
  software_name: string; installed_version: string; min_safe_version: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cve_refs: string[]; impact: string; remediation: string; action: string;
  vendor: string; is_vulnerable: boolean;
}

function compareVersions(installed: string, minSafe: string): number {
  const normalize = (v: string): number[] => {
    const javaMatch = v.match(/^(\d+)u(\d+)$/);
    if (javaMatch) return [parseInt(javaMatch[1]), parseInt(javaMatch[2])];
    return v.split(/[.\-_]/).map(p => parseInt(p.replace(/[^\d]/g, '')) || 0).slice(0, 4);
  };
  const v1 = normalize(installed); const v2 = normalize(minSafe);
  const maxLen = Math.max(v1.length, v2.length);
  while (v1.length < maxLen) v1.push(0);
  while (v2.length < maxLen) v2.push(0);
  for (let i = 0; i < maxLen; i++) {
    if (v1[i] < v2[i]) return -1;
    if (v1[i] > v2[i]) return 1;
  }
  return 0;
}

function matchesSoftware(name: string, baseline: VulnerabilityBaseline): boolean {
  const n = name.toLowerCase().trim();
  if (n.includes(baseline.software_name.toLowerCase())) return true;
  return (baseline.software_name_patterns || []).some(p => n.includes(p.toLowerCase()));
}

function calculateRiskScore(risks: SoftwareRisk[]): number {
  let score = 0;
  for (const r of risks) {
    if (!r.is_vulnerable) continue;
    score += r.severity === 'critical' ? 40 : r.severity === 'high' ? 25 : r.severity === 'medium' ? 10 : 5;
  }
  return Math.min(score, 100);
}

servePublic(async (req, ctx) => {
  const { supabase } = ctx;

  const parsed = InputSchema.safeParse(ctx.body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }), { status: 400 });
  }

  const { agent_id, software_list } = parsed.data;

  if (!agent_id && !software_list) {
    return new Response(JSON.stringify({ error: 'Either agent_id or software_list is required' }), { status: 400 });
  }

  let softwareItems: Array<{ name: string; version: string; vendor?: string }> = [];

  if (agent_id) {
    const { data: inventory } = await supabase.from('software_inventory').select('name, version, vendor').eq('agent_id', agent_id).order('name');
    softwareItems = inventory || [];
  } else if (software_list) {
    softwareItems = software_list;
  }

  if (softwareItems.length === 0) {
    return { total_software: 0, vulnerable_count: 0, critical_count: 0, high_count: 0, medium_count: 0, low_count: 0, risk_score: 0, risks: [], evaluated_at: new Date().toISOString() };
  }

  const { data: baselines } = await supabase.from('software_vulnerability_baseline').select('*').eq('is_active', true);
  const vulnerabilityBaselines = (baselines as VulnerabilityBaseline[]) || [];

  const risks: SoftwareRisk[] = [];

  for (const software of softwareItems) {
    if (!software.name || !software.version) continue;
    for (const baseline of vulnerabilityBaselines) {
      if (matchesSoftware(software.name, baseline)) {
        const isVulnerable = compareVersions(software.version, baseline.min_safe_version) < 0;
        risks.push({
          software_name: software.name, installed_version: software.version,
          min_safe_version: baseline.min_safe_version, severity: baseline.severity,
          cve_refs: baseline.cve_refs, impact: baseline.impact, remediation: baseline.remediation,
          action: baseline.action, vendor: baseline.vendor, is_vulnerable: isVulnerable,
        });
        break;
      }
    }
  }

  const vulnerableRisks = risks.filter(r => r.is_vulnerable);
  const summary = {
    total_software: softwareItems.length,
    vulnerable_count: vulnerableRisks.length,
    critical_count: vulnerableRisks.filter(r => r.severity === 'critical').length,
    high_count: vulnerableRisks.filter(r => r.severity === 'high').length,
    medium_count: vulnerableRisks.filter(r => r.severity === 'medium').length,
    low_count: vulnerableRisks.filter(r => r.severity === 'low').length,
    risk_score: calculateRiskScore(vulnerableRisks),
    risks: risks.sort((a, b) => {
      if (a.is_vulnerable !== b.is_vulnerable) return a.is_vulnerable ? -1 : 1;
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    }),
    evaluated_at: new Date().toISOString(),
  };

  if (agent_id && vulnerableRisks.length > 0) {
    const { data: agent } = await supabase.from('agents').select('tenant_id').eq('id', agent_id).single();
    if (agent?.tenant_id) {
      const findingRows = vulnerableRisks.map(risk => ({
        tenant_id: agent.tenant_id,
        agent_id: agent_id,
        severity: risk.severity,
        check_key: `baseline-${risk.software_name.toLowerCase().replace(/\s+/g, '-')}-${risk.min_safe_version}`,
        title: `${risk.software_name} desatualizado (${risk.installed_version} < ${risk.min_safe_version})`,
        description: risk.impact,
        remediation: risk.remediation,
        last_seen_at: new Date().toISOString(),
      }));
      await supabase.from('vuln_findings').upsert(findingRows, { onConflict: 'agent_id,check_key' });
    }
  }

  return summary;
}, { methods: ['POST'] });
