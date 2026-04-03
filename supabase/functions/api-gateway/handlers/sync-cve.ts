/**
 * sync-cve-database handler — inlined from standalone sync-cve-database function
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

type SB = ReturnType<typeof createClient>;

const FETCH_TIMEOUT_MS = 30000;

const BodySchema = z.object({
  keywords: z.array(z.string().max(100)).max(100).optional(),
}).passthrough();

const CVE_KEYWORDS = [
  'chrome', 'firefox', 'edge', 'windows', 'office', 'microsoft',
  'java', 'python', 'nodejs', 'node.js', 'apache', 'nginx',
  'wordpress', 'php', 'mysql', 'postgresql', 'redis', 'mongodb',
  'docker', 'kubernetes', 'jenkins', 'git', 'vscode', 'visual studio',
  'adobe', 'reader', 'acrobat', 'flash', 'photoshop',
  'zoom', 'slack', 'teams', 'outlook', 'excel', 'word', 'powerpoint',
  'vmware', 'virtualbox', 'hyper-v', 'citrix',
  '7-zip', 'winrar', 'vlc', 'notepad++', 'putty', 'filezilla',
  'openssh', 'openssl', 'curl', 'wget',
];

interface NVDResponse {
  totalResults: number;
  vulnerabilities: Array<{
    cve: {
      id: string;
      descriptions: Array<{ lang: string; value: string }>;
      published: string;
      lastModified: string;
      metrics?: {
        cvssMetricV31?: Array<{ cvssData: { baseScore: number; baseSeverity: string; vectorString: string } }>;
        cvssMetricV2?: Array<{ cvssData: { baseScore: number } }>;
      };
      configurations?: Array<{ nodes: Array<{ cpeMatch: Array<{ vulnerable: boolean; criteria: string; versionStartIncluding?: string; versionEndIncluding?: string; versionStartExcluding?: string; versionEndExcluding?: string }> }> }>;
      references?: Array<{ url: string; source: string }>;
    };
  }>;
}

async function fetchNVDCVEs(keyword: string): Promise<NVDResponse | null> {
  const NVD_API_KEY = Deno.env.get('NVD_API_KEY');
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  const params = new URLSearchParams({ keywordSearch: keyword, pubStartDate: startDate.toISOString(), pubEndDate: endDate.toISOString(), resultsPerPage: '100', startIndex: '0' });
  const headers: HeadersInit = { 'Accept': 'application/json' };
  if (NVD_API_KEY) headers['apiKey'] = NVD_API_KEY;
  try {
    const response = await fetchWithTimeout(`https://services.nvd.nist.gov/rest/json/cves/2.0?${params}`, { timeoutMs: FETCH_TIMEOUT_MS, headers });
    if (response.status === 403) { logger.warn(`NVD rate limited: ${keyword}`); return null; }
    if (!response.ok) { logger.error(`NVD error: ${response.status}`); return null; }
    return await response.json();
  } catch (error) { logger.error(`NVD fetch error ${keyword}:`, error); return null; }
}

function extractCVSS(metrics: NVDResponse['vulnerabilities'][0]['cve']['metrics']) {
  if (metrics?.cvssMetricV31?.[0]) { const v = metrics.cvssMetricV31[0].cvssData; return { score: v.baseScore, severity: v.baseSeverity, vector: v.vectorString, version: '3.1' }; }
  if (metrics?.cvssMetricV2?.[0]) { const v = metrics.cvssMetricV2[0].cvssData; return { score: v.baseScore, severity: v.baseScore >= 7 ? 'HIGH' : v.baseScore >= 4 ? 'MEDIUM' : 'LOW', vector: null, version: '2.0' }; }
  return { score: null, severity: 'UNKNOWN', vector: null, version: null };
}

function extractVersions(configurations: NVDResponse['vulnerabilities'][0]['cve']['configurations']) {
  const versions: Array<{ cpe: string; versionStart?: string; versionEnd?: string; versionStartType?: string; versionEndType?: string }> = [];
  if (!configurations) return versions;
  for (const config of configurations) for (const node of config.nodes) for (const match of node.cpeMatch) if (match.vulnerable) {
    versions.push({ cpe: match.criteria, versionStart: match.versionStartIncluding || match.versionStartExcluding, versionEnd: match.versionEndIncluding || match.versionEndExcluding, versionStartType: match.versionStartIncluding ? 'including' : 'excluding', versionEndType: match.versionEndIncluding ? 'including' : 'excluding' });
  }
  return versions;
}

export async function handleSyncCveDatabase(
  supabase: SB, requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const startTime = Date.now();
  logger.info(`[sync-cve-database][${requestId}] Starting CVE sync...`);

  const parsed = BodySchema.safeParse(payload || {});
  if (!parsed.success) return { __status: 400, error: 'Invalid input', issues: parsed.error.flatten().fieldErrors };

  let keywords = CVE_KEYWORDS;
  if (parsed.data.keywords) keywords = parsed.data.keywords;

  let totalFetched = 0, totalInserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    const result = await fetchNVDCVEs(keyword);
    if (!result) { errors.push(`Failed: ${keyword}`); await new Promise(r => setTimeout(r, 6000)); continue; }
    totalFetched += result.totalResults;

    const cveRecords = result.vulnerabilities.map((vuln: Record<string, unknown>) => {
      const cve = vuln.cve as NVDResponse['vulnerabilities'][0]['cve'];
      const cvss = extractCVSS(cve.metrics);
      const affectedVersions = extractVersions(cve.configurations);
      const description = cve.descriptions.find(d => d.lang === 'en')?.value || cve.descriptions[0]?.value || '';
      return { cve_id: cve.id, description: description.substring(0, 5000), cvss_score: cvss.score, severity: cvss.severity, cvss_vector: cvss.vector, cvss_version: cvss.version, published_date: cve.published, last_modified: cve.lastModified, affected_versions: affectedVersions, cve_references: cve.references?.slice(0, 10) || [], source: 'nvd', cached_at: new Date().toISOString(), is_active: true };
    });

    const BATCH_SIZE = 50;
    for (let b = 0; b < cveRecords.length; b += BATCH_SIZE) {
      const batch = cveRecords.slice(b, b + BATCH_SIZE);
      const { error: upsertError } = await supabase.from('cve_database').upsert(batch, { onConflict: 'cve_id', ignoreDuplicates: false });
      if (upsertError) logger.error(`Batch upsert error:`, upsertError);
      else totalInserted += batch.length;
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  const syncDuration = Math.round((Date.now() - startTime) / 1000);
  const { data: existingStatus } = await supabase.from('cve_sync_status').select('id').limit(1).single();
  const syncStatusId = existingStatus?.id || crypto.randomUUID();
  await supabase.from('cve_sync_status').upsert({ id: syncStatusId, last_sync_at: new Date().toISOString(), sync_status: errors.length > 0 ? 'partial' : 'success', total_cves_synced: totalInserted, error_message: errors.length > 0 ? errors.join('; ') : null }, { onConflict: 'id' });

  const { count } = await supabase.from('cve_database').select('*', { count: 'exact', head: true });

  return { success: true, sync_duration_seconds: syncDuration, keywords_processed: keywords.length, total_cves_fetched: totalFetched, cves_upserted: totalInserted, total_cves_in_database: count || 0, errors: errors.length > 0 ? errors : undefined };
}
