/**
 * Threat feed fetcher implementations
 * Extraído de sync-threat-feeds/index.ts
 */
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 30000;

export interface RawIndicator {
  type: 'ip_address' | 'domain' | 'url' | 'file_hash_sha256' | 'file_hash_md5';
  value: string;
  severity: 'unknown' | 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  confidence: number;
  reference?: string;
  metadata?: Record<string, unknown>;
}

// ── MalwareBazaar ──

export async function fetchMalwareBazaarRecent(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  const abuseKey = Deno.env.get('ABUSE_CH_API_KEY');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (abuseKey) headers['Auth-Key'] = abuseKey;
    const resp = await fetchWithTimeout('https://mb-api.abuse.ch/api/v1/', { timeoutMs: FETCH_TIMEOUT_MS, method: 'POST', headers, body: 'query=get_recent&limit=50' });

    if (!resp.ok) {
      logger.info(`MalwareBazaar JSON API unavailable (${resp.status}), using CSV fallback`);
      await resp.text();
      return await fetchMalwareBazaarCSV();
    }

    const text = await resp.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { logger.warn('MalwareBazaar returned non-JSON:', text.substring(0, 200)); return await fetchMalwareBazaarCSV(); }

    if (data.query_status === 'ok' && Array.isArray(data.data)) {
      for (const entry of data.data) {
        if (!entry.sha256_hash) continue;
        indicators.push({
          type: 'file_hash_sha256', value: entry.sha256_hash, severity: 'high',
          tags: Array.isArray(entry.tags) ? entry.tags : (entry.tags ? [entry.tags] : []),
          confidence: 80,
          reference: `https://bazaar.abuse.ch/sample/${entry.sha256_hash}/`,
          metadata: { file_type: entry.file_type, file_name: entry.file_name, signature: entry.signature, reporter: entry.reporter, delivery_method: entry.delivery_method },
        });
      }
    }
  } catch (err) { logger.error('MalwareBazaar fetch error:', err); }
  return indicators;
}

async function fetchMalwareBazaarCSV(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    const resp = await fetchWithTimeout('https://bazaar.abuse.ch/export/csv/recent/', { timeoutMs: FETCH_TIMEOUT_MS, method: 'GET' });
    if (!resp.ok) { logger.warn(`MalwareBazaar CSV HTTP ${resp.status}`); return indicators; }
    const text = await resp.text();
    const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
    for (const line of lines.slice(0, 100)) {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const sha256 = parts[1]?.replace(/"/g, '').trim();
      if (!sha256 || sha256.length !== 64) continue;
      indicators.push({
        type: 'file_hash_sha256', value: sha256, severity: 'high',
        tags: parts[8] ? [parts[8].replace(/"/g, '').trim()] : [], confidence: 75,
        reference: `https://bazaar.abuse.ch/sample/${sha256}/`,
        metadata: { file_name: parts[5]?.replace(/"/g, '').trim(), file_type: parts[6]?.replace(/"/g, '').trim(), signature: parts[8]?.replace(/"/g, '').trim(), reporter: parts[4]?.replace(/"/g, '').trim() },
      });
    }
    logger.info(`MalwareBazaar CSV fallback: ${indicators.length} indicators`);
  } catch (err) { logger.error('MalwareBazaar CSV fetch error:', err); }
  return indicators;
}

// ── URLhaus ──

export async function fetchURLhaus(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  const abuseKey = Deno.env.get('ABUSE_CH_API_KEY');
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (abuseKey) headers['Auth-Key'] = abuseKey;
    const resp = await fetchWithTimeout('https://urlhaus-api.abuse.ch/v1/urls/recent/', { timeoutMs: FETCH_TIMEOUT_MS, method: 'POST', headers, body: 'limit=100' });

    if (!resp.ok) { await resp.text(); return await fetchURLhausCSV(); }
    const text = await resp.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { return await fetchURLhausCSV(); }

    if (data.query_status === 'ok' && Array.isArray(data.urls)) {
      for (const entry of data.urls) {
        if (!entry.url) continue;
        indicators.push({
          type: 'url', value: entry.url,
          severity: entry.threat === 'malware_download' ? 'critical' : 'high',
          tags: Array.isArray(entry.tags) ? entry.tags : (entry.tags ? [String(entry.tags)] : []),
          confidence: 85, reference: entry.urlhaus_reference,
          metadata: { threat: entry.threat, host: entry.host, url_status: entry.url_status },
        });
      }
    }
  } catch (err) { logger.error('URLhaus fetch error:', err); }
  return indicators;
}

async function fetchURLhausCSV(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    const resp = await fetchWithTimeout('https://urlhaus.abuse.ch/downloads/csv_recent/');
    if (!resp.ok) { logger.warn(`URLhaus CSV HTTP ${resp.status}`); return indicators; }
    const text = await resp.text();
    const lines = text.split('\n').filter(l => l && !l.startsWith('#'));
    for (const line of lines.slice(0, 100)) {
      const parts = line.split(',');
      if (parts.length < 3) continue;
      const url = parts[2]?.replace(/"/g, '').trim();
      if (!url || !url.startsWith('http')) continue;
      indicators.push({
        type: 'url', value: url,
        severity: (parts[5]?.replace(/"/g, '').trim() === 'malware_download') ? 'critical' : 'high',
        tags: parts[6] ? parts[6].replace(/"/g, '').trim().split('|').filter(Boolean) : [],
        confidence: 80, reference: parts[7]?.replace(/"/g, '').trim(),
        metadata: { threat: parts[5]?.replace(/"/g, '').trim(), url_status: parts[3]?.replace(/"/g, '').trim() },
      });
    }
    logger.info(`URLhaus CSV fallback: ${indicators.length} indicators`);
  } catch (err) { logger.error('URLhaus CSV fetch error:', err); }
  return indicators;
}

// ── Feodo Tracker ──

export async function fetchFeodoTracker(): Promise<RawIndicator[]> {
  const indicators: RawIndicator[] = [];
  try {
    const resp = await fetchWithTimeout('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json');
    if (!resp.ok) { logger.warn(`Feodo Tracker HTTP ${resp.status}`); return indicators; }
    const text = await resp.text();
    let data: any;
    try { data = JSON.parse(text); } catch { logger.warn('Feodo Tracker returned non-JSON'); return indicators; }
    const entries = Array.isArray(data) ? data : [];
    for (const entry of entries) {
      const ip = entry.ip_address || entry.dst_ip;
      if (!ip) continue;
      indicators.push({
        type: 'ip_address', value: ip, severity: 'critical',
        tags: [entry.malware || 'botnet'].filter(Boolean), confidence: 90,
        reference: `https://feodotracker.abuse.ch/browse/host/${ip}/`,
        metadata: { port: entry.dst_port, malware: entry.malware, first_seen: entry.first_seen, last_online: entry.last_online },
      });
    }
  } catch (err) { logger.error('Feodo Tracker fetch error:', err); }
  return indicators;
}
