import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VIRUSTOTAL_API_KEY = Deno.env.get('VIRUSTOTAL_API_KEY');
const ABUSEIPDB_API_KEY = Deno.env.get('ABUSEIPDB_API_KEY');

interface AnalyzeUrlBody {
  url: string;
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Autenticacao via JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extrair user do JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tenantId = await getTenantIdForUser(supabase, user.id);
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Tenant not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting: 30 requests per minute per user
    const rateLimitResult = await checkRateLimit(supabase, user.id, 'analyze-url', {
      maxRequests: 30,
      windowMinutes: 1,
      blockMinutes: 5,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt?.toISOString(),
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: AnalyzeUrlBody = await req.json();
    if (!body.url) {
      return new Response(
        JSON.stringify({ error: 'url required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(body.url);
    } catch {
      return new Response(
        JSON.stringify({ error: 'invalid url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedUrl = body.url.trim();
    const domain = parsed.hostname;

    logger.info(`[analyze-url] Analyzing URL: ${normalizedUrl}`);

    // Check cache first (24h TTL)
    const { data: cached } = await supabase
      .from('url_reputation')
      .select('*')
      .eq('url', normalizedUrl)
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (cached) {
      logger.info(`[analyze-url] Cache hit for: ${domain}`);
      return new Response(JSON.stringify({
        url: cached.url,
        domain: cached.domain,
        reputation: cached.reputation,
        score: cached.score,
        category: cached.category,
        details: cached.details,
        cached: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
        logger.info(`[analyze-url] VirusTotal result: ${reputation} (score: ${score})`);
      } catch (vtError) {
        logger.error('[analyze-url] VirusTotal error:', vtError);
        // Continue to fallback
      }
    }

    // If VirusTotal failed or returned unknown, try AbuseIPDB for IP/domain
    if ((reputation === 'unknown' || !VIRUSTOTAL_API_KEY) && ABUSEIPDB_API_KEY) {
      try {
        // Extract IP from domain if possible
        const ipMatch = domain.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
        if (ipMatch) {
          const abuseResult = await analyzeWithAbuseIPDB(domain, ABUSEIPDB_API_KEY);
          
          // Calculate reputation from abuse score
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
          logger.info(`[analyze-url] AbuseIPDB result: ${reputation} (score: ${score})`);
        }
      } catch (abuseError) {
        logger.error('[analyze-url] AbuseIPDB error:', abuseError);
      }
    }

    // If no API keys configured, provide basic analysis
    if (!VIRUSTOTAL_API_KEY && !ABUSEIPDB_API_KEY) {
      logger.warn('[analyze-url] No threat intelligence APIs configured');
      details.warning = 'No threat intelligence APIs configured. Configure VIRUSTOTAL_API_KEY or ABUSEIPDB_API_KEY for real analysis.';
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
      }, {
        onConflict: 'tenant_id,url',
      });

    if (insertError) {
      logger.error('[analyze-url] Failed to insert URL reputation', insertError);
    }

    const result = {
      url: normalizedUrl,
      domain,
      reputation,
      score,
      category,
      details,
      cached: false,
    };

    logger.success(`[analyze-url] URL analyzed: ${domain} - ${reputation}`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error('[analyze-url] URL analysis failed', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

/**
 * Analyze URL with VirusTotal API
 */
async function analyzeWithVirusTotal(url: string, apiKey: string): Promise<VirusTotalResult> {
  // First, submit URL for analysis
  const urlId = btoa(url).replace(/=/g, '');
  
  // Try to get existing analysis first
  const getResponse = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
    method: 'GET',
    headers: {
      'x-apikey': apiKey,
    },
  });

  if (getResponse.status === 404) {
    // URL not in VirusTotal, submit for scanning
    const scanResponse = await fetch('https://www.virustotal.com/api/v3/urls', {
      method: 'POST',
      headers: {
        'x-apikey': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `url=${encodeURIComponent(url)}`,
    });

    if (!scanResponse.ok) {
      throw new Error(`VirusTotal scan failed: ${scanResponse.status}`);
    }

    // Return unknown since scan is pending
    return {
      reputation: 'scanning',
      score: 50,
      category: 'pending_analysis',
      engines_detected: 0,
      engines_total: 0,
      details: { status: 'Scan submitted, check back later' },
    };
  }

  if (!getResponse.ok) {
    throw new Error(`VirusTotal API error: ${getResponse.status}`);
  }

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

  if (malicious >= 3) {
    reputation = 'malicious';
    score = Math.max(0, 100 - (malicious / total) * 100);
  } else if (malicious >= 1 || suspicious >= 3) {
    reputation = 'suspicious';
    score = Math.max(0, 100 - ((malicious + suspicious) / total) * 100);
  } else {
    reputation = 'clean';
    score = Math.min(100, (harmless / total) * 100);
  }

  // Get primary category
  const categoryValues = Object.values(categories);
  const category = categoryValues[0] as string || 'unclassified';

  return {
    reputation,
    score: Math.round(score),
    category,
    engines_detected: malicious + suspicious,
    engines_total: total,
    details: {
      stats,
      categories,
      last_analysis_date: data.data?.attributes?.last_analysis_date,
    },
  };
}

/**
 * Analyze IP with AbuseIPDB API
 */
async function analyzeWithAbuseIPDB(ip: string, apiKey: string): Promise<AbuseIPDBResult> {
  const response = await fetch(
    `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
    {
      method: 'GET',
      headers: {
        'Key': apiKey,
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`AbuseIPDB API error: ${response.status}`);
  }

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
