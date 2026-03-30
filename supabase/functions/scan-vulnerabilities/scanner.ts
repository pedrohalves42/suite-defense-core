/**
 * Core vulnerability scanner logic extracted from index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import {
  SoftwareItem,
  extractKeywords,
  isVersionAffected,
  getSeverityFromScore,
  normalizeSeverity,
  truncate,
  generateRemediation,
  scanWithFallback,
} from './vuln-helpers.ts';

/** Scan a single agent's vulnerabilities against CVE database */
export async function scanAgentVulnerabilities(
  supabase: SupabaseClient,
  agent_id: string,
  tenant_id: string,
  requestId: string,
  options: { keywordLimit?: number; cveLimit?: number; mode?: 'batch' | 'single' } = {}
): Promise<{ vulnerabilities_found: number; vulnerabilities: Array<Record<string, unknown>> }> {
  const keywordLimit = options.keywordLimit ?? (options.mode === 'batch' ? 20 : 30);
  const cveLimit = options.cveLimit ?? (options.mode === 'batch' ? 30 : 50);

  const { data: software, error: softwareError } = await supabase
    .from('software_inventory')
    .select('name, version, vendor')
    .eq('agent_id', agent_id)
    .limit(200);

  if (softwareError || !software || software.length === 0) {
    return { vulnerabilities_found: 0, vulnerabilities: [] };
  }

  const softwareKeywords = new Set<string>();
  const softwareMap = new Map<string, SoftwareItem[]>();

  for (const item of software as SoftwareItem[]) {
    const name = item.name?.toLowerCase() || '';
    const keywords = extractKeywords(name);
    keywords.forEach(kw => {
      softwareKeywords.add(kw);
      if (!softwareMap.has(kw)) softwareMap.set(kw, []);
      softwareMap.get(kw)!.push(item);
    });
  }

  const vulnerabilities: Array<Record<string, unknown>> = [];
  const processedCVEs = new Set<string>();

  for (const keyword of Array.from(softwareKeywords).slice(0, keywordLimit)) {
    const orFilter = options.mode === 'batch'
      ? `affected_products.cs.{${keyword}},description.ilike.%${keyword}%`
      : `affected_products.cs.{${keyword}},description.ilike.%${keyword}%,cpe_matches.cs.{${keyword}}`;

    const { data: cves, error: cveError } = await supabase
      .from('cve_database')
      .select('*')
      .or(orFilter)
      .gte('cvss_score', 4.0)
      .order('cvss_score', { ascending: false })
      .limit(cveLimit);

    if (cveError) {
      logger.info(`[${requestId}] [SCAN-VULNS] Error searching CVEs for "${keyword}":`, cveError.message);
      continue;
    }

    if (cves && cves.length > 0) {
      for (const cve of cves) {
        if (processedCVEs.has(cve.cve_id)) continue;
        const matchedSoftware = softwareMap.get(keyword) || [];
        for (const sw of matchedSoftware) {
          if (isVersionAffected(sw.version, cve.affected_versions)) {
            processedCVEs.add(cve.cve_id);
            const now = new Date().toISOString();
            vulnerabilities.push({
              agent_id,
              tenant_id,
              check_key: cve.cve_id,
              title: `${cve.cve_id}: ${truncate(cve.description, 100)}`,
              description: cve.description,
              severity: normalizeSeverity(cve.severity || getSeverityFromScore(cve.cvss_score)),
              remediation: options.mode === 'batch'
                ? `Update ${sw.name.split(/[\s\-_]/)[0]} to the latest version`
                : generateRemediation(sw.name, cve),
              first_seen_at: now,
              last_seen_at: now,
            });
            break;
          }
        }
      }
    }
  }

  // Fallback for single-agent mode
  if (options.mode === 'single' && vulnerabilities.length === 0) {
    logger.info(`[${requestId}] [SCAN-VULNS] No dynamic CVEs found, using fallback`);
    const fallbackVulns = scanWithFallback(software as SoftwareItem[], agent_id, tenant_id);
    vulnerabilities.push(...fallbackVulns);
  }

  return { vulnerabilities_found: vulnerabilities.length, vulnerabilities };
}
