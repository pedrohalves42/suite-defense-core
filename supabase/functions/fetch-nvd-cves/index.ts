import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// NVD API 2.0 base URL
const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

// Rate limiting: NVD allows 5 requests per 30 seconds without API key
const RATE_LIMIT_DELAY_MS = 6500; // ~6.5 seconds between requests

interface NVDResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities: NVDVulnerability[];
}

interface NVDVulnerability {
  cve: {
    id: string;
    sourceIdentifier: string;
    published: string;
    lastModified: string;
    vulnStatus: string;
    descriptions: Array<{ lang: string; value: string }>;
    metrics?: {
      cvssMetricV31?: Array<{
        cvssData: {
          version: string;
          vectorString: string;
          baseScore: number;
          baseSeverity: string;
        };
      }>;
      cvssMetricV30?: Array<{
        cvssData: {
          version: string;
          vectorString: string;
          baseScore: number;
          baseSeverity: string;
        };
      }>;
      cvssMetricV2?: Array<{
        cvssData: {
          version: string;
          vectorString: string;
          baseScore: number;
        };
        baseSeverity: string;
      }>;
    };
    configurations?: Array<{
      nodes: Array<{
        cpeMatch: Array<{
          vulnerable: boolean;
          criteria: string;
          versionEndExcluding?: string;
          versionEndIncluding?: string;
          versionStartIncluding?: string;
        }>;
      }>;
    }>;
    references?: Array<{
      url: string;
      source: string;
      tags?: string[];
    }>;
    weaknesses?: Array<{
      source: string;
      type: string;
      description: Array<{ lang: string; value: string }>;
    }>;
  };
}

interface CVERecord {
  cve_id: string;
  description: string;
  cvss_score: number | null;
  cvss_version: string;
  cvss_vector: string | null;
  severity: string;
  affected_products: string[];
  affected_versions: object[];
  cpe_matches: object[];
  published_date: string;
  last_modified: string;
  cve_references: object[];
  weaknesses: string[];
  cached_at: string;
  source: string;
  is_active: boolean;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  logger.info(`[${requestId}] [FETCH-NVD] Starting NVD CVE fetch`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    
    // Support multiple search modes
    const { 
      keyword,           // Search by keyword (e.g., "Chrome", "Firefox")
      cpeMatchString,    // Search by CPE (e.g., "cpe:2.3:a:google:chrome:*:*:*:*:*:*:*:*")
      cveId,             // Fetch specific CVE
      lastModStartDate,  // For incremental sync
      resultsPerPage = 50,
      startIndex = 0,
      forceRefresh = false
    } = body;

    // Check cache first (unless force refresh)
    if (!forceRefresh && keyword) {
      const { data: cachedCVEs, error: cacheError } = await supabase
        .from('cve_database')
        .select('*')
        .ilike('affected_products', `%${keyword}%`)
        .gte('cached_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 24h cache
        .order('cvss_score', { ascending: false })
        .limit(100);

      if (!cacheError && cachedCVEs && cachedCVEs.length > 0) {
        logger.info(`[${requestId}] [FETCH-NVD] Cache hit: ${cachedCVEs.length} CVEs for "${keyword}"`);
        return new Response(
          JSON.stringify({
            success: true,
            source: 'cache',
            cves: cachedCVEs,
            total: cachedCVEs.length
          }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build NVD API URL
    const params = new URLSearchParams();
    
    if (cveId) {
      params.append('cveId', cveId);
    } else if (cpeMatchString) {
      params.append('cpeName', cpeMatchString);
    } else if (keyword) {
      params.append('keywordSearch', keyword);
      params.append('keywordExactMatch', 'false');
    }
    
    if (lastModStartDate) {
      params.append('lastModStartDate', lastModStartDate);
      params.append('lastModEndDate', new Date().toISOString());
    }
    
    params.append('resultsPerPage', String(Math.min(resultsPerPage, 2000)));
    params.append('startIndex', String(startIndex));

    const nvdUrl = `${NVD_API_BASE}?${params.toString()}`;
    logger.info(`[${requestId}] [FETCH-NVD] Fetching from NVD: ${nvdUrl}`);

    // Fetch from NVD API
    const nvdResponse = await fetchWithTimeout(nvdUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CyberShield-Security-Scanner/1.0'
      }
    });

    if (!nvdResponse.ok) {
      const errorText = await nvdResponse.text();
      logger.error(`[${requestId}] [FETCH-NVD] NVD API error: ${nvdResponse.status} - ${errorText}`);
      
      // If rate limited, return appropriate error
      if (nvdResponse.status === 403 || nvdResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'NVD API rate limit exceeded. Please wait and try again.',
            retry_after_seconds: 30
          }),
          { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`NVD API error: ${nvdResponse.status}`);
    }

    const nvdData: NVDResponse = await nvdResponse.json();
    logger.info(`[${requestId}] [FETCH-NVD] NVD returned ${nvdData.totalResults} total results, ${nvdData.vulnerabilities.length} in this page`);

    // Transform NVD data to our format
    const cveRecords: CVERecord[] = nvdData.vulnerabilities.map(vuln => {
      const cve = vuln.cve;
      
      // Get best available CVSS score
      const cvssV31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
      const cvssV30 = cve.metrics?.cvssMetricV30?.[0]?.cvssData;
      const cvssV2 = cve.metrics?.cvssMetricV2?.[0];
      
      let cvssScore: number | null = null;
      let cvssVersion = '3.1';
      let cvssVector: string | null = null;
      let severity = 'UNKNOWN';
      
      if (cvssV31) {
        cvssScore = cvssV31.baseScore;
        cvssVersion = cvssV31.version;
        cvssVector = cvssV31.vectorString;
        severity = cvssV31.baseSeverity;
      } else if (cvssV30) {
        cvssScore = cvssV30.baseScore;
        cvssVersion = cvssV30.version;
        cvssVector = cvssV30.vectorString;
        severity = cvssV30.baseSeverity;
      } else if (cvssV2) {
        cvssScore = cvssV2.cvssData.baseScore;
        cvssVersion = cvssV2.cvssData.version;
        cvssVector = cvssV2.cvssData.vectorString;
        severity = cvssV2.baseSeverity || 'MEDIUM';
      }

      // Extract English description
      const description = cve.descriptions.find(d => d.lang === 'en')?.value || 
                         cve.descriptions[0]?.value || 
                         'No description available';

      // Extract affected products from CPE matches
      const cpeMatches: object[] = [];
      const affectedProducts: string[] = [];
      const affectedVersions: object[] = [];
      
      cve.configurations?.forEach(config => {
        config.nodes?.forEach(node => {
          node.cpeMatch?.forEach(match => {
            if (match.vulnerable) {
              cpeMatches.push(match);
              
              // Parse CPE to extract product name
              const cpeParts = match.criteria.split(':');
              if (cpeParts.length >= 5) {
                const vendor = cpeParts[3];
                const product = cpeParts[4];
                const productName = `${vendor}/${product}`.replace(/_/g, ' ');
                if (!affectedProducts.includes(productName)) {
                  affectedProducts.push(productName);
                }
                
                affectedVersions.push({
                  product: product,
                  vendor: vendor,
                  versionEndExcluding: match.versionEndExcluding,
                  versionEndIncluding: match.versionEndIncluding,
                  versionStartIncluding: match.versionStartIncluding
                });
              }
            }
          });
        });
      });

      // Extract weaknesses (CWE IDs)
      const weaknesses: string[] = [];
      cve.weaknesses?.forEach(w => {
        w.description?.forEach(d => {
          if (d.value && d.value.startsWith('CWE-')) {
            weaknesses.push(d.value);
          }
        });
      });

      // Extract references
      const cveReferences = cve.references?.map(ref => ({
        url: ref.url,
        source: ref.source,
        tags: ref.tags || []
      })) || [];

      return {
        cve_id: cve.id,
        description,
        cvss_score: cvssScore,
        cvss_version: cvssVersion,
        cvss_vector: cvssVector,
        severity,
        affected_products: affectedProducts,
        affected_versions: affectedVersions,
        cpe_matches: cpeMatches,
        published_date: cve.published,
        last_modified: cve.lastModified,
        cve_references: cveReferences,
        weaknesses,
        cached_at: new Date().toISOString(),
        source: 'nvd',
        is_active: true
      };
    });

    // Upsert CVEs to database
    if (cveRecords.length > 0) {
      const { error: upsertError } = await supabase
        .from('cve_database')
        .upsert(cveRecords, { 
          onConflict: 'cve_id',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        logger.error(`[${requestId}] [FETCH-NVD] Error upserting CVEs:`, upsertError);
        // Don't throw, still return results
      } else {
        logger.info(`[${requestId}] [FETCH-NVD] Cached ${cveRecords.length} CVEs to database`);
      }
    }

    // Update sync status
    await supabase
      .from('cve_sync_status')
      .update({
        last_sync_at: new Date().toISOString(),
        total_cves_synced: nvdData.totalResults,
        sync_status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('sync_status', 'pending')
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        source: 'nvd_api',
        cves: cveRecords,
        total: nvdData.totalResults,
        page: {
          resultsPerPage: nvdData.resultsPerPage,
          startIndex: nvdData.startIndex,
          hasMore: nvdData.startIndex + nvdData.resultsPerPage < nvdData.totalResults
        }
      }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[${requestId}] [FETCH-NVD] Error:`, message);
    
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
