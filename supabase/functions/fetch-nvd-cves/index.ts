/**
 * fetch-nvd-cves - Migrated to serveInternal
 * Fetches CVEs from NVD API and caches in database
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const FETCH_TIMEOUT_MS = 30000;

const BodySchema = z.object({
  keyword: z.string().max(200).optional(),
  cpeMatchString: z.string().max(500).optional(),
  cveId: z.string().regex(/^CVE-\d{4}-\d+$/).optional(),
  lastModStartDate: z.string().datetime().optional(),
  resultsPerPage: z.number().int().min(1).max(2000).default(50),
  startIndex: z.number().int().min(0).default(0),
  forceRefresh: z.boolean().default(false),
}).passthrough();

interface NVDResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities: Array<{ cve: Record<string, unknown> }>;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;
  const parsed = BodySchema.safeParse(body || {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { keyword, cpeMatchString, cveId, lastModStartDate, resultsPerPage, startIndex, forceRefresh } = parsed.data;

  logger.info(`[${requestId}] [FETCH-NVD] Starting NVD CVE fetch`);

  // Check cache first
  if (!forceRefresh && keyword) {
    const { data: cachedCVEs, error: cacheError } = await supabase
      .from('cve_database').select('*')
      .ilike('affected_products', `%${keyword}%`)
      .gte('cached_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('cvss_score', { ascending: false }).limit(100);

    if (!cacheError && cachedCVEs && cachedCVEs.length > 0) {
      logger.info(`[${requestId}] [FETCH-NVD] Cache hit: ${cachedCVEs.length} CVEs`);
      return { success: true, source: 'cache', cves: cachedCVEs, total: cachedCVEs.length };
    }
  }

  // Build NVD API URL
  const params = new URLSearchParams();
  if (cveId) params.append('cveId', cveId);
  else if (cpeMatchString) params.append('cpeName', cpeMatchString);
  else if (keyword) { params.append('keywordSearch', keyword); params.append('keywordExactMatch', 'false'); }
  if (lastModStartDate) { params.append('lastModStartDate', lastModStartDate); params.append('lastModEndDate', new Date().toISOString()); }
  params.append('resultsPerPage', String(Math.min(resultsPerPage, 2000)));
  params.append('startIndex', String(startIndex));

  const nvdUrl = `${NVD_API_BASE}?${params.toString()}`;
  logger.info(`[${requestId}] [FETCH-NVD] Fetching: ${nvdUrl}`);

  const nvdResponse = await fetchWithTimeout(nvdUrl, {
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { 'Accept': 'application/json', 'User-Agent': 'CyberShield-Security-Scanner/1.0' },
  });

  if (!nvdResponse.ok) {
    if (nvdResponse.status === 403 || nvdResponse.status === 429) {
      return new Response(JSON.stringify({ error: 'NVD API rate limit exceeded', retry_after_seconds: 30 }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`NVD API error: ${nvdResponse.status}`);
  }

  const nvdData: NVDResponse = await nvdResponse.json();
  logger.info(`[${requestId}] [FETCH-NVD] NVD returned ${nvdData.totalResults} total, ${nvdData.vulnerabilities.length} in page`);

  // Transform data
  const cveRecords = nvdData.vulnerabilities.map(vuln => {
    const cve = vuln.cve as Record<string, unknown>;
    const metrics = cve.metrics as Record<string, unknown[]> | undefined;
    const cvssV31 = (metrics?.cvssMetricV31 as Array<{ cvssData: Record<string, unknown> }>)?.[0]?.cvssData;
    const cvssV30 = (metrics?.cvssMetricV30 as Array<{ cvssData: Record<string, unknown> }>)?.[0]?.cvssData;
    const cvssV2 = (metrics?.cvssMetricV2 as Array<Record<string, unknown>>)?.[0];

    let cvss_score: number | null = null, cvss_version = '3.1', cvss_vector: string | null = null, severity = 'UNKNOWN';
    if (cvssV31) { cvss_score = cvssV31.baseScore as number; cvss_version = cvssV31.version as string; cvss_vector = cvssV31.vectorString as string; severity = cvssV31.baseSeverity as string; }
    else if (cvssV30) { cvss_score = cvssV30.baseScore as number; cvss_version = cvssV30.version as string; cvss_vector = cvssV30.vectorString as string; severity = cvssV30.baseSeverity as string; }
    else if (cvssV2) { const d = cvssV2.cvssData as Record<string, unknown>; cvss_score = d.baseScore as number; cvss_version = d.version as string; cvss_vector = d.vectorString as string; severity = (cvssV2.baseSeverity || 'MEDIUM') as string; }

    const descriptions = cve.descriptions as Array<{ lang: string; value: string }>;
    const description = descriptions?.find(d => d.lang === 'en')?.value || descriptions?.[0]?.value || 'No description';

    const affected_products: string[] = [];
    const configurations = cve.configurations as Array<{ nodes: Array<{ cpeMatch: Array<Record<string, unknown>> }> }> | undefined;
    configurations?.forEach(config => config.nodes?.forEach(node => node.cpeMatch?.forEach(match => {
      if (match.vulnerable) {
        const parts = (match.criteria as string).split(':');
        if (parts.length >= 5) { const name = `${parts[3]}/${parts[4]}`.replace(/_/g, ' '); if (!affected_products.includes(name)) affected_products.push(name); }
      }
    })));

    const weaknesses: string[] = [];
    (cve.weaknesses as Array<{ description: Array<{ value: string }> }> | undefined)?.forEach(w => w.description?.forEach(d => { if (d.value?.startsWith('CWE-')) weaknesses.push(d.value); }));

    return {
      cve_id: cve.id as string, description, cvss_score, cvss_version, cvss_vector, severity,
      affected_products, affected_versions: [], cpe_matches: [],
      published_date: cve.published as string, last_modified: cve.lastModified as string,
      cve_references: ((cve.references as Array<Record<string, unknown>>) || []).map(r => ({ url: r.url, source: r.source, tags: r.tags || [] })),
      weaknesses, cached_at: new Date().toISOString(), source: 'nvd', is_active: true,
    };
  });

  if (cveRecords.length > 0) {
    const { error: upsertError } = await supabase.from('cve_database').upsert(cveRecords, { onConflict: 'cve_id', ignoreDuplicates: false });
    if (upsertError) logger.error(`[${requestId}] [FETCH-NVD] Upsert error:`, upsertError);
    else logger.info(`[${requestId}] [FETCH-NVD] Cached ${cveRecords.length} CVEs`);
  }

  return {
    success: true, source: 'nvd_api', cves: cveRecords, total: nvdData.totalResults,
    page: { resultsPerPage: nvdData.resultsPerPage, startIndex: nvdData.startIndex, hasMore: nvdData.startIndex + nvdData.resultsPerPage < nvdData.totalResults },
  };
});
