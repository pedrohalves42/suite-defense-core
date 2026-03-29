/**
 * Threat Intelligence Lookup - Migrated to serveTenant
 * Auth: JWT + tenant validation via serveTenant middleware
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

interface ThreatIntelResult {
  target: string;
  target_type: 'url' | 'ip' | 'domain';
  reputation: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  risk_score: number;
  sources: Array<{
    name: string;
    verdict: string;
    confidence: number;
    details?: Record<string, unknown>;
  }>;
  whois_data?: Record<string, unknown>;
  ssl_data?: Record<string, unknown>;
  cached: boolean;
  cached_at?: string;
}

// VirusTotal URL/Domain scan
async function checkVirusTotal(target: string, type: 'url' | 'domain' | 'ip'): Promise<{
  verdict: string;
  score: number;
  details: Record<string, unknown>;
} | null> {
  const apiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
  if (!apiKey) {
    logger.warn('VIRUSTOTAL_API_KEY not configured');
    return null;
  }
  
  try {
    let endpoint: string;
    
    if (type === 'url') {
      const id = btoa(target).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      endpoint = `https://www.virustotal.com/api/v3/urls/${id}`;
    } else if (type === 'domain') {
      endpoint = `https://www.virustotal.com/api/v3/domains/${target}`;
    } else {
      endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${target}`;
    }
    
    const response = await fetchWithTimeout(endpoint, {
      headers: { 'x-apikey': apiKey },
    });
    
    if (response.status === 404) {
      if (type === 'url') {
        const submitResponse = await fetchWithTimeout('https://www.virustotal.com/api/v3/urls', {
          method: 'POST',
          headers: {
            'x-apikey': apiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `url=${encodeURIComponent(target)}`,
        });
        
        if (submitResponse.ok) {
          return { verdict: 'pending', score: 0, details: { status: 'submitted_for_analysis' } };
        }
      }
      return { verdict: 'unknown', score: 0, details: { status: 'not_found' } };
    }
    
    if (!response.ok) {
      logger.error(`VirusTotal API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const stats = data.data?.attributes?.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((a: number, b) => a + (b as number), 0) as number;
    
    let verdict = 'clean';
    let score = 0;
    
    if (malicious > 3) {
      verdict = 'malicious';
      score = Math.min(100, malicious * 10);
    } else if (malicious > 0 || suspicious > 2) {
      verdict = 'suspicious';
      score = Math.min(70, (malicious + suspicious) * 10);
    }
    
    return {
      verdict,
      score,
      details: {
        malicious_count: malicious,
        suspicious_count: suspicious,
        total_scanners: total,
        reputation: data.data?.attributes?.reputation,
        categories: data.data?.attributes?.categories,
      },
    };
  } catch (error) {
    logger.error('VirusTotal check failed:', error);
    return null;
  }
}

// AbuseIPDB check
async function checkAbuseIPDB(ip: string): Promise<{
  verdict: string;
  score: number;
  details: Record<string, unknown>;
} | null> {
  const apiKey = Deno.env.get('ABUSEIPDB_API_KEY');
  if (!apiKey) {
    logger.warn('ABUSEIPDB_API_KEY not configured');
    return null;
  }
  
  try {
    const response = await fetchWithTimeout(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      {
        headers: {
          'Key': apiKey,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      logger.error(`AbuseIPDB API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const abuseScore = data.data?.abuseConfidenceScore || 0;
    
    let verdict = 'clean';
    if (abuseScore >= 80) {
      verdict = 'malicious';
    } else if (abuseScore >= 30) {
      verdict = 'suspicious';
    }
    
    return {
      verdict,
      score: abuseScore,
      details: {
        abuse_confidence_score: abuseScore,
        country_code: data.data?.countryCode,
        isp: data.data?.isp,
        domain: data.data?.domain,
        total_reports: data.data?.totalReports,
        last_reported_at: data.data?.lastReportedAt,
        is_tor: data.data?.isTor,
        is_public: data.data?.isPublic,
      },
    };
  } catch (error) {
    logger.error('AbuseIPDB check failed:', error);
    return null;
  }
}

// URLhaus check (free, no API key needed)
async function checkURLhaus(target: string): Promise<{
  verdict: string;
  score: number;
  details: Record<string, unknown>;
} | null> {
  try {
    const response = await fetchWithTimeout('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(target)}`,
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.query_status === 'ok' && data.url_status) {
      return {
        verdict: 'malicious',
        score: 100,
        details: {
          threat: data.threat,
          tags: data.tags,
          urlhaus_reference: data.urlhaus_reference,
          date_added: data.date_added,
        },
      };
    }
    
    return { verdict: 'clean', score: 0, details: { status: 'not_found_in_urlhaus' } };
  } catch (error) {
    logger.error('URLhaus check failed:', error);
    return null;
  }
}

// PhishTank check (free, no API key needed for basic checks)
async function checkPhishTank(url: string): Promise<{
  verdict: string;
  score: number;
  details: Record<string, unknown>;
} | null> {
  try {
    const response = await fetchWithTimeout('https://checkurl.phishtank.com/checkurl/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(url)}&format=json`,
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.results?.in_database && data.results?.valid) {
      return {
        verdict: 'malicious',
        score: 100,
        details: {
          phish_id: data.results.phish_id,
          phish_detail_page: data.results.phish_detail_page,
          verified: data.results.verified,
          verified_at: data.results.verified_at,
        },
      };
    }
    
    return { verdict: 'clean', score: 0, details: { in_database: false } };
  } catch (error) {
    logger.error('PhishTank check failed:', error);
    return null;
  }
}

function determineTargetType(target: string): 'url' | 'ip' | 'domain' {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(target)) return 'ip';
  if (target.startsWith('http://') || target.startsWith('https://')) return 'url';
  return 'domain';
}

// ─── serveTenant migration ───────────────────────────────────────────────────

interface ThreatIntelBody {
  target?: string;
  skip_cache?: boolean;
}

serveTenant<ThreatIntelBody>(async (_req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;
  
  const target = body?.target;
  const skip_cache = body?.skip_cache ?? false;
  
  if (!target || typeof target !== 'string') {
    return new Response(
      JSON.stringify({ error: 'target is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const targetType = determineTargetType(target);
  const normalizedTarget = target.trim().toLowerCase();
  
  logger.info(`[${requestId}] Threat intelligence lookup: ${targetType} - ${normalizedTarget}`);
  
  // Check cache first
  if (!skip_cache) {
    const { data: cached } = await supabase
      .from('threat_intelligence_cache')
      .select('*')
      .eq('target', normalizedTarget)
      .eq('target_type', targetType)
      .eq('tenant_id', tenantId)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (cached) {
      logger.info(`[${requestId}] Cache hit for ${normalizedTarget}`);
      return {
        target: cached.target,
        target_type: cached.target_type,
        reputation: cached.reputation,
        risk_score: cached.risk_score,
        sources: cached.sources,
        whois_data: cached.whois_data,
        ssl_data: cached.ssl_data,
        cached: true,
        cached_at: cached.cached_at,
      };
    }
  }
  
  // Run all checks in parallel
  const sources: ThreatIntelResult['sources'] = [];
  const rawResponses: Record<string, unknown> = {};
  
  const checks = await Promise.allSettled([
    targetType === 'ip' 
      ? checkAbuseIPDB(normalizedTarget)
      : checkVirusTotal(normalizedTarget, targetType),
    targetType === 'url' ? checkURLhaus(normalizedTarget) : null,
    targetType === 'url' ? checkPhishTank(normalizedTarget) : null,
    targetType === 'domain' 
      ? checkVirusTotal(normalizedTarget, 'domain')
      : null,
  ]);
  
  if (checks[0].status === 'fulfilled' && checks[0].value) {
    const result = checks[0].value;
    sources.push({
      name: targetType === 'ip' ? 'AbuseIPDB' : 'VirusTotal',
      verdict: result.verdict,
      confidence: result.score,
      details: result.details,
    });
    rawResponses[targetType === 'ip' ? 'abuseipdb' : 'virustotal'] = result;
  }
  
  if (checks[1].status === 'fulfilled' && checks[1].value) {
    const result = checks[1].value;
    sources.push({
      name: 'URLhaus',
      verdict: result.verdict,
      confidence: result.score,
      details: result.details,
    });
    rawResponses.urlhaus = result;
  }
  
  if (checks[2].status === 'fulfilled' && checks[2].value) {
    const result = checks[2].value;
    sources.push({
      name: 'PhishTank',
      verdict: result.verdict,
      confidence: result.score,
      details: result.details,
    });
    rawResponses.phishtank = result;
  }
  
  if (checks[3].status === 'fulfilled' && checks[3].value) {
    const result = checks[3].value;
    sources.push({
      name: 'VirusTotal (Domain)',
      verdict: result.verdict,
      confidence: result.score,
      details: result.details,
    });
    rawResponses.virustotal_domain = result;
  }
  
  // Calculate aggregate score and reputation
  let maxScore = 0;
  let reputation: ThreatIntelResult['reputation'] = 'unknown';
  
  for (const source of sources) {
    if (source.confidence > maxScore) {
      maxScore = source.confidence;
    }
    
    if (source.verdict === 'malicious') {
      reputation = 'malicious';
    } else if (source.verdict === 'suspicious' && reputation !== 'malicious') {
      reputation = 'suspicious';
    } else if (source.verdict === 'clean' && reputation === 'unknown') {
      reputation = 'clean';
    }
  }
  
  if (sources.length === 0) {
    reputation = 'unknown';
  }
  
  // Cache the result
  await supabase
    .from('threat_intelligence_cache')
    .upsert({
      target: normalizedTarget,
      target_type: targetType,
      reputation,
      risk_score: maxScore,
      sources,
      raw_responses: rawResponses,
      tenant_id: tenantId,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, {
      onConflict: 'target,target_type,tenant_id',
    });
  
  logger.info(`[${requestId}] Threat intel complete: ${normalizedTarget} = ${reputation} (score: ${maxScore})`);
  
  return {
    target: normalizedTarget,
    target_type: targetType,
    reputation,
    risk_score: maxScore,
    sources,
    cached: false,
  } satisfies ThreatIntelResult;
}, {
  rateLimit: { endpoint: 'threat-intelligence-lookup', maxRequests: 30, windowMinutes: 1 },
});
