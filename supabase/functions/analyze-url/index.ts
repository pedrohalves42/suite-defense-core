import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const VIRUSTOTAL_API_KEY = Deno.env.get('VIRUSTOTAL_API_KEY');
const ABUSEIPDB_API_KEY = Deno.env.get('ABUSEIPDB_API_KEY');

interface VirusTotalResult {
  reputation: string;
  score: number;
  category: string;
  engines_detected: number;
  engines_total: number;
  details: Record<string, any>;
}

interface AbuseIPDBResult {
  is_public: boolean;
  abuse_confidence_score: number;
  country_code: string;
  isp: string;
  domain: string;
  total_reports: number;
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  // Rate limiting: 30 requests per minute per user
  const rateLimitResult = await checkRateLimit(supabase, userId, 'analyze-url', {
    maxRequests: 30,
    windowMinutes: 1,
    blockMinutes: 5,
  });

  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', resetAt: rateLimitResult.resetAt?.toISOString() }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!body?.url) {
    return new Response(
      JSON.stringify({ error: 'url required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(body.url);
  } catch {
    return new Response(
      JSON.stringify({ error: 'invalid url' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const normalizedUrl = body.url.trim();
  const domain = parsed.hostname;

  logger.info(`[${requestId}] Analyzing URL: ${normalizedUrl}`);

  // Check cache first (24h TTL)
  const { data: cached } = await supabase
    .from('url_reputation')
    .select('*')
    .eq('url', normalizedUrl)
    .eq('tenant_id', tenantId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .maybeSingle();

  if (cached) {
    logger.info(`[${requestId}] Cache hit for: ${domain}`);
    return {
      url: cached.url,
      domain: cached.domain,
      reputation: cached.reputation,
      score: cached.score,
      category: cached.category,
      details: cached.details,
      cached: true,
    };
  }

  let reputation = 'unknown';
  let score = 0;
  let category = 'unclassified';
  let details: Record<string, any> = {};

  // Try VirusTotal first
  if (VIRUSTOTAL_API_KEY) {
    try {
      const vtResult = await analyzeWithVirusTotal(normalizedUrl, VIRUSTOTAL_API_KEY);
      reputation = vtResult.reputation;
      score = vtResult.score;
      category = vtResult.category;
      details.virustotal = {
        engines_detected: vtResult.engines_detected,
        engines_total: vtResult.engines_total,
        ...vtResult.details,
      };
      logger.info(`[${requestId}] VirusTotal result: ${reputation} (score: ${score})`);
    } catch (vtError) {
      logger.error(`[${requestId}] VirusTotal error:`, vtError);
    }
  }

  // If VirusTotal failed or returned unknown, try AbuseIPDB for IP/domain
  if ((reputation === 'unknown' || !VIRUSTOTAL_API_KEY) && ABUSEIPDB_API_KEY) {
    try {
      const ipMatch = domain.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      if (ipMatch) {
        const abuseResult = await analyzeWithAbuseIPDB(domain, ABUSEIPDB_API_KEY);
        if (abuseResult.abuse_confidence_score >= 75) {
          reputation = 'malicious';
          score = abuseResult.abuse_confidence_score;
        } else if (abuseResult.abuse_confidence_score >= 25) {
          reputation = 'suspicious';
          score = abuseResult.abuse_confidence_score;
        } else {
          reputation = 'clean';
          score = 100 - abuseResult.abuse_confidence_score;
        }
        details.abuseipdb = {
          abuse_confidence_score: abuseResult.abuse_confidence_score,
          country_code: abuseResult.country_code,
          isp: abuseResult.isp,
          total_reports: abuseResult.total_reports,
        };
        logger.info(`[${requestId}] AbuseIPDB result: ${reputation} (score: ${score})`);
      }
    } catch (abuseError) {
      logger.error(`[${requestId}] AbuseIPDB error:`, abuseError);
    }
  }

  if (!VIRUSTOTAL_API_KEY && !ABUSEIPDB_API_KEY) {
    logger.warn(`[${requestId}] No threat intelligence APIs configured`);
    details.warning = 'No threat intelligence APIs configured.';
  }

  // Save to url_reputation
  const { error: insertError } = await supabase
    .from('url_reputation')
    .upsert({
      tenant_id: tenantId,
      url: normalizedUrl,
      domain,
      reputation,
      score,
      category,
      details,
      created_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,url' });

  if (insertError) {
    logger.error(`[${requestId}] Failed to insert URL reputation`, insertError);
  }

  logger.success(`[${requestId}] URL analyzed: ${domain} - ${reputation}`);

  return { url: normalizedUrl, domain, reputation, score, category, details, cached: false };
}, { methods: ['POST'] });

async function analyzeWithVirusTotal(url: string, apiKey: string): Promise<VirusTotalResult> {
  const urlId = btoa(url).replace(/=/g, '');
  const getResponse = await fetchWithTimeout(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
    method: 'GET',
    headers: { 'x-apikey': apiKey },
  });

  if (getResponse.status === 404) {
    const scanResponse = await fetchWithTimeout('https://www.virustotal.com/api/v3/urls', {
      method: 'POST',
      headers: { 'x-apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(url)}`,
    });
    if (!scanResponse.ok) throw new Error(`VirusTotal scan failed: ${scanResponse.status}`);
    return { reputation: 'scanning', score: 50, category: 'pending_analysis', engines_detected: 0, engines_total: 0, details: { status: 'Scan submitted' } };
  }

  if (!getResponse.ok) throw new Error(`VirusTotal API error: ${getResponse.status}`);

  const data = await getResponse.json();
  const stats = data.data?.attributes?.last_analysis_stats || {};
  const categories = data.data?.attributes?.categories || {};
  const malicious = stats.malicious || 0;
  const suspicious = stats.suspicious || 0;
  const harmless = stats.harmless || 0;
  const undetected = stats.undetected || 0;
  const total = malicious + suspicious + harmless + undetected;

  let reputation: string;
  let score: number;
  if (malicious >= 3) { reputation = 'malicious'; score = Math.max(0, 100 - (malicious / total) * 100); }
  else if (malicious >= 1 || suspicious >= 3) { reputation = 'suspicious'; score = Math.max(0, 100 - ((malicious + suspicious) / total) * 100); }
  else { reputation = 'clean'; score = Math.min(100, (harmless / total) * 100); }

  const categoryValues = Object.values(categories);
  const category = categoryValues[0] as string || 'unclassified';

  return { reputation, score: Math.round(score), category, engines_detected: malicious + suspicious, engines_total: total, details: { stats, categories, last_analysis_date: data.data?.attributes?.last_analysis_date } };
}

async function analyzeWithAbuseIPDB(ip: string, apiKey: string): Promise<AbuseIPDBResult> {
  const response = await fetchWithTimeout(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, {
    method: 'GET',
    headers: { 'Key': apiKey, 'Accept': 'application/json' },
  });
  if (!response.ok) throw new Error(`AbuseIPDB API error: ${response.status}`);
  const data = await response.json();
  const result = data.data || {};
  return {
    is_public: result.isPublic || false,
    abuse_confidence_score: result.abuseConfidenceScore || 0,
    country_code: result.countryCode || '',
    isp: result.isp || '',
    domain: result.domain || '',
    total_reports: result.totalReports || 0,
  };
}
