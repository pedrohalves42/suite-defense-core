/**
 * Threat intelligence provider integrations
 */
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

export interface ProviderResult {
  verdict: string;
  score: number;
  details: Record<string, unknown>;
}

export async function checkVirusTotal(target: string, type: 'url' | 'domain' | 'ip'): Promise<ProviderResult | null> {
  const apiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
  if (!apiKey) { logger.warn('VIRUSTOTAL_API_KEY not configured'); return null; }
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
    const response = await fetchWithTimeout(endpoint, { headers: { 'x-apikey': apiKey } });
    if (response.status === 404) {
      if (type === 'url') {
        const submitResponse = await fetchWithTimeout('https://www.virustotal.com/api/v3/urls', { method: 'POST', headers: { 'x-apikey': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(target)}` });
        if (submitResponse.ok) return { verdict: 'pending', score: 0, details: { status: 'submitted_for_analysis' } };
      }
      return { verdict: 'unknown', score: 0, details: { status: 'not_found' } };
    }
    if (!response.ok) { logger.error(`VirusTotal API error: ${response.status}`); return null; }
    const data = await response.json();
    const stats = data.data?.attributes?.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = Object.values(stats).reduce((a: number, b) => a + (b as number), 0) as number;
    let verdict = 'clean'; let score = 0;
    if (malicious > 3) { verdict = 'malicious'; score = Math.min(100, malicious * 10); }
    else if (malicious > 0 || suspicious > 2) { verdict = 'suspicious'; score = Math.min(70, (malicious + suspicious) * 10); }
    return { verdict, score, details: { malicious_count: malicious, suspicious_count: suspicious, total_scanners: total, reputation: data.data?.attributes?.reputation, categories: data.data?.attributes?.categories } };
  } catch (error) { logger.error('VirusTotal check failed:', error); return null; }
}

export async function checkAbuseIPDB(ip: string): Promise<ProviderResult | null> {
  const apiKey = Deno.env.get('ABUSEIPDB_API_KEY');
  if (!apiKey) { logger.warn('ABUSEIPDB_API_KEY not configured'); return null; }
  try {
    const response = await fetchWithTimeout(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`, { headers: { 'Key': apiKey, 'Accept': 'application/json' } });
    if (!response.ok) { logger.error(`AbuseIPDB API error: ${response.status}`); return null; }
    const data = await response.json();
    const abuseScore = data.data?.abuseConfidenceScore || 0;
    let verdict = 'clean';
    if (abuseScore >= 80) verdict = 'malicious';
    else if (abuseScore >= 30) verdict = 'suspicious';
    return { verdict, score: abuseScore, details: { abuse_confidence_score: abuseScore, country_code: data.data?.countryCode, isp: data.data?.isp, domain: data.data?.domain, total_reports: data.data?.totalReports, last_reported_at: data.data?.lastReportedAt, is_tor: data.data?.isTor, is_public: data.data?.isPublic } };
  } catch (error) { logger.error('AbuseIPDB check failed:', error); return null; }
}

export async function checkURLhaus(target: string): Promise<ProviderResult | null> {
  try {
    const response = await fetchWithTimeout('https://urlhaus-api.abuse.ch/v1/url/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(target)}` });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.query_status === 'ok' && data.url_status) return { verdict: 'malicious', score: 100, details: { threat: data.threat, tags: data.tags, urlhaus_reference: data.urlhaus_reference, date_added: data.date_added } };
    return { verdict: 'clean', score: 0, details: { status: 'not_found_in_urlhaus' } };
  } catch (error) { logger.error('URLhaus check failed:', error); return null; }
}

export async function checkPhishTank(url: string): Promise<ProviderResult | null> {
  try {
    const response = await fetchWithTimeout('https://checkurl.phishtank.com/checkurl/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(url)}&format=json` });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.results?.in_database && data.results?.valid) return { verdict: 'malicious', score: 100, details: { phish_id: data.results.phish_id, phish_detail_page: data.results.phish_detail_page, verified: data.results.verified, verified_at: data.results.verified_at } };
    return { verdict: 'clean', score: 0, details: { in_database: false } };
  } catch (error) { logger.error('PhishTank check failed:', error); return null; }
}

export function determineTargetType(target: string): 'url' | 'ip' | 'domain' {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(target)) return 'ip';
  if (target.startsWith('http://') || target.startsWith('https://')) return 'url';
  return 'domain';
}
