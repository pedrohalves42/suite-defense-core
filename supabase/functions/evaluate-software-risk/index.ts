import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SoftwareItem {
  name: string;
  version: string;
  vendor?: string;
}

interface VulnerabilityBaseline {
  id: string;
  software_name: string;
  software_name_patterns: string[];
  vendor: string;
  min_safe_version: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cve_refs: string[];
  impact: string;
  remediation: string;
  action: string;
}

interface SoftwareRisk {
  software_name: string;
  installed_version: string;
  min_safe_version: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cve_refs: string[];
  impact: string;
  remediation: string;
  action: string;
  vendor: string;
  is_vulnerable: boolean;
}

interface RiskSummary {
  total_software: number;
  vulnerable_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  risk_score: number; // 0-100
  risks: SoftwareRisk[];
  evaluated_at: string;
}

/**
 * Compare semantic versions
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(installed: string, minSafe: string): number {
  // Normalize versions - extract numeric parts
  const normalize = (v: string): number[] => {
    // Handle special cases like "8u401" for Java
    const javaMatch = v.match(/^(\d+)u(\d+)$/);
    if (javaMatch) {
      return [parseInt(javaMatch[1]), parseInt(javaMatch[2])];
    }
    
    // Standard version parsing
    return v.split(/[.\-_]/)
      .map(p => parseInt(p.replace(/[^\d]/g, '')) || 0)
      .slice(0, 4);
  };
  
  const v1Parts = normalize(installed);
  const v2Parts = normalize(minSafe);
  
  // Pad arrays to same length
  const maxLen = Math.max(v1Parts.length, v2Parts.length);
  while (v1Parts.length < maxLen) v1Parts.push(0);
  while (v2Parts.length < maxLen) v2Parts.push(0);
  
  for (let i = 0; i < maxLen; i++) {
    if (v1Parts[i] < v2Parts[i]) return -1;
    if (v1Parts[i] > v2Parts[i]) return 1;
  }
  
  return 0;
}

/**
 * Check if software name matches any pattern
 */
function matchesSoftware(softwareName: string, baseline: VulnerabilityBaseline): boolean {
  const normalizedName = softwareName.toLowerCase().trim();
  
  // Check main name
  if (normalizedName.includes(baseline.software_name.toLowerCase())) {
    return true;
  }
  
  // Check patterns
  for (const pattern of baseline.software_name_patterns || []) {
    if (normalizedName.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate risk score based on vulnerabilities found
 */
function calculateRiskScore(risks: SoftwareRisk[]): number {
  if (risks.length === 0) return 0;
  
  let score = 0;
  
  for (const risk of risks) {
    if (!risk.is_vulnerable) continue;
    
    switch (risk.severity) {
      case 'critical':
        score += 40;
        break;
      case 'high':
        score += 25;
        break;
      case 'medium':
        score += 10;
        break;
      case 'low':
        score += 5;
        break;
    }
  }
  
  // Cap at 100
  return Math.min(score, 100);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const payload = await req.json();
    const { agent_id, software_list } = payload;
    
    // Validate input
    if (!agent_id && !software_list) {
      return new Response(
        JSON.stringify({ error: 'Either agent_id or software_list is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    let softwareItems: SoftwareItem[] = [];
    
    // If agent_id provided, fetch from software_inventory
    if (agent_id) {
      logger.info(`Evaluating software risk for agent: ${agent_id}`);
      
      const { data: inventory, error: invError } = await supabase
        .from('software_inventory')
        .select('name, version, vendor')
        .eq('agent_id', agent_id)
        .order('name');
      
      if (invError) {
        logger.error('Failed to fetch software inventory', invError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch software inventory' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      softwareItems = inventory || [];
    } else if (software_list && Array.isArray(software_list)) {
      // Use provided software list
      softwareItems = software_list;
    }
    
    if (softwareItems.length === 0) {
      logger.info('No software to evaluate');
      return new Response(
        JSON.stringify({
          total_software: 0,
          vulnerable_count: 0,
          critical_count: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 0,
          risk_score: 0,
          risks: [],
          evaluated_at: new Date().toISOString()
        } as RiskSummary),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Fetch vulnerability baseline
    const { data: baselines, error: baseError } = await supabase
      .from('software_vulnerability_baseline')
      .select('*')
      .eq('is_active', true);
    
    if (baseError) {
      logger.error('Failed to fetch vulnerability baseline', baseError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch vulnerability baseline' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const vulnerabilityBaselines = baselines as VulnerabilityBaseline[] || [];
    logger.info(`Loaded ${vulnerabilityBaselines.length} vulnerability baselines`);
    
    // Evaluate each software against baselines
    const risks: SoftwareRisk[] = [];
    
    for (const software of softwareItems) {
      if (!software.name || !software.version) continue;
      
      // Find matching baseline
      for (const baseline of vulnerabilityBaselines) {
        if (matchesSoftware(software.name, baseline)) {
          const versionComparison = compareVersions(software.version, baseline.min_safe_version);
          const isVulnerable = versionComparison < 0;
          
          risks.push({
            software_name: software.name,
            installed_version: software.version,
            min_safe_version: baseline.min_safe_version,
            severity: baseline.severity,
            cve_refs: baseline.cve_refs,
            impact: baseline.impact,
            remediation: baseline.remediation,
            action: baseline.action,
            vendor: baseline.vendor,
            is_vulnerable: isVulnerable
          });
          
          if (isVulnerable) {
            logger.info(`Vulnerability found: ${software.name} v${software.version} < ${baseline.min_safe_version} (${baseline.severity})`);
          }
          
          break; // Found match, move to next software
        }
      }
    }
    
    // Calculate summary
    const vulnerableRisks = risks.filter(r => r.is_vulnerable);
    const summary: RiskSummary = {
      total_software: softwareItems.length,
      vulnerable_count: vulnerableRisks.length,
      critical_count: vulnerableRisks.filter(r => r.severity === 'critical').length,
      high_count: vulnerableRisks.filter(r => r.severity === 'high').length,
      medium_count: vulnerableRisks.filter(r => r.severity === 'medium').length,
      low_count: vulnerableRisks.filter(r => r.severity === 'low').length,
      risk_score: calculateRiskScore(vulnerableRisks),
      risks: risks.sort((a, b) => {
        // Sort by vulnerability status, then severity
        if (a.is_vulnerable !== b.is_vulnerable) return a.is_vulnerable ? -1 : 1;
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }),
      evaluated_at: new Date().toISOString()
    };
    
    logger.success(`Risk evaluation complete: ${summary.vulnerable_count} vulnerabilities found, risk score: ${summary.risk_score}`);
    
    // If agent_id provided, optionally store results in vuln_findings
    if (agent_id && vulnerableRisks.length > 0) {
      // Get agent's tenant_id
      const { data: agent } = await supabase
        .from('agents')
        .select('tenant_id')
        .eq('id', agent_id)
        .single();
      
      if (agent?.tenant_id) {
        // V-6003: Batch upsert findings instead of 1-by-1 loop
        const findingRows = vulnerableRisks.map(risk => {
          const checkKey = `baseline-${risk.software_name.toLowerCase().replace(/\s+/g, '-')}-${risk.min_safe_version}`;
          return {
            tenant_id: agent.tenant_id,
            agent_id: agent_id,
            severity: risk.severity,
            check_key: checkKey,
            title: `${risk.software_name} desatualizado (${risk.installed_version} < ${risk.min_safe_version})`,
            description: risk.impact,
            remediation: risk.remediation,
            last_seen_at: new Date().toISOString(),
          };
        });

        await supabase
          .from('vuln_findings')
          .upsert(findingRows, { onConflict: 'agent_id,check_key' });
        
        logger.info(`Stored ${vulnerableRisks.length} findings in vuln_findings table`);
      }
    }
    
    // If called by cron, update health check
    const isCronCall = req.headers.get('x-cron-source') === 'true';
    if (isCronCall) {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'evaluate-software-risk-daily',
        p_success: true,
        p_error: null
      });
    }

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    logger.error('Software risk evaluation failed', error);
    
    // If called by cron, register failure
    const isCronCall = req.headers.get('x-cron-source') === 'true';
    if (isCronCall) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.rpc('update_cron_health', {
          p_cron_name: 'evaluate-software-risk-daily',
          p_success: false,
          p_error: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch {
        logger.error('Failed to update cron health');
      }
    }
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
