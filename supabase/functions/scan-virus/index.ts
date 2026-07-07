// D17-D3: @ts-nocheck removed. Typing only — runtime, HMAC verification,
// quota checks, scanner fallbacks and auto-quarantine invocation unchanged.
/**
 * scan-virus — Migrated to serveAgent middleware with HMAC verification.
 *
 * R4 Wave 3A.2 (2026-07-07): the two external malware-lookup GETs
 * (Hybrid Analysis and VirusTotal) are wrapped with `withRetry`.
 * `fetchWithTimeout` is preserved as per-attempt timeout. Persistence
 * (virus_scans insert, quota update, auto-quarantine invoke) stays
 * OUTSIDE the retry envelope so a retried lookup never duplicates
 * writes. Non-retriable statuses (404, other 4xx) continue to fall
 * through to the existing `return null` fallback path unchanged.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { checkQuotaAvailable } from '../_shared/quota.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { withRetry } from '../_shared/reliability/retry.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const FETCH_TIMEOUT_MS = 30000;

/** Retry policy for external malware-lookup GETs — conservative, small budget. */
const LOOKUP_RETRY = {
  method: 'GET' as const,
  idempotent: true,
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  totalBudgetMs: 6000,
  jitter: 'full' as const,
};

/**
 * GET an external malware-analysis URL with per-attempt timeout and
 * transient-only retry. Same shape as `githubGet` in
 * validate-build-pipeline (Wave 3A.1): retriable statuses (408, 425,
 * 429, 5xx) throw a classifier-friendly error; other responses are
 * returned as-is so the caller keeps its existing non-retriable
 * handling (404, other 4xx → return null).
 */
async function lookupGet(
  url: string,
  init: RequestInit & { timeoutMs?: number },
  provider: 'virustotal' | 'hybrid_analysis',
  requestId?: string,
): Promise<Response> {
  return await withRetry(async () => {
    const res = await fetchWithTimeout(url, init);
    if (res.status === 408 || res.status === 425 || res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader && /^\d+$/.test(retryAfterHeader)
        ? Number(retryAfterHeader) * 1000
        : undefined;
      // Body must be consumed to release the Deno stream before the retry sleeps.
      await res.text().catch(() => {});
      const err = new Error(`${provider} transient ${res.status}`) as Error & { status: number; retryAfterMs?: number };
      err.status = res.status;
      if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs;
      throw err;
    }
    return res;
  }, { ...LOOKUP_RETRY, requestId });
}

async function scanWithHybridAnalysis(fileHash: string, apiKey: string, requestId?: string): Promise<ScanResult | null> {
  try {
    const resp = await lookupGet(
      `https://www.hybrid-analysis.com/api/v2/report/${fileHash}/summary`,
      { timeoutMs: FETCH_TIMEOUT_MS, headers: { 'api-key': apiKey, 'User-Agent': 'CyberShield' } },
      'hybrid_analysis',
      requestId,
    );
    if (resp.status === 404 || !resp.ok) { await resp.text().catch(() => {}); return null; }
    const data = await resp.json();
    const threatScore = data.threat_score || 0;
    const isMalicious = threatScore >= 50 || (data.verdict || '').includes('malicious');
    return { isMalicious, positives: isMalicious ? threatScore : 0, totalScans: 100, permalink: `https://www.hybrid-analysis.com/sample/${fileHash}`, scanDate: data.analysis_start_time, scans: data, scannerUsed: 'hybrid_analysis' };
  } catch (err) { logger.warn('[scan-virus] Hybrid Analysis scan failed', err); return null; }
}

async function scanWithVirusTotal(fileHash: string, apiKey: string, requestId?: string): Promise<ScanResult | null> {
  try {
    const resp = await lookupGet(
      `https://www.virustotal.com/vtapi/v2/file/report?apikey=${apiKey}&resource=${fileHash}`,
      { timeoutMs: FETCH_TIMEOUT_MS },
      'virustotal',
      requestId,
    );
    if (!resp.ok) { await resp.text().catch(() => {}); return null; }
    const data = await resp.json();
    if (data.response_code !== 1) return null;
    return { isMalicious: data.positives > 0, positives: data.positives || 0, totalScans: data.total || 0, permalink: data.permalink, scanDate: data.scan_date, scans: data.scans, scannerUsed: 'virustotal' };
  } catch (err) { logger.warn('[scan-virus] VirusTotal scan failed', err); return null; }
}

interface ScanResult {
  isMalicious: boolean;
  positives: number;
  totalScans: number;
  permalink?: string;
  scanDate?: string;
  scans?: unknown;
  scannerUsed: 'hybrid_analysis' | 'virustotal';
}

const ScanVirusSchema = z.object({
  filePath: z.string().min(1).max(1024),
  fileHash: z.string().min(32).max(128).regex(/^[a-fA-F0-9]+$/),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, body, requestId } = ctx;

  const parsed = ScanVirusSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { filePath, fileHash } = parsed.data;

  const hybridAnalysisApiKey = Deno.env.get('HYBRID_ANALYSIS_API_KEY');
  const virusTotalApiKey = Deno.env.get('VIRUSTOTAL_API_KEY');

  if (!hybridAnalysisApiKey && !virusTotalApiKey) {
    return new Response(JSON.stringify({ error: 'Nenhum servico de scan configurado' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Quota checks
  const quotaCheck = await checkQuotaAvailable(supabase, tenantId, 'max_scans_per_month');
  if (!quotaCheck.allowed) {
    return new Response(JSON.stringify({ error: quotaCheck.error || 'Quota de scans excedida', quotaUsed: quotaCheck.current, quotaLimit: quotaCheck.limit }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  const dailyQuotaCheck = await checkQuotaAvailable(supabase, tenantId, 'advanced_scans_daily');
  if (!dailyQuotaCheck.allowed) {
    return new Response(JSON.stringify({ error: 'Limite diario de scans avancados atingido', quotaUsed: dailyQuotaCheck.current, quotaLimit: dailyQuotaCheck.limit }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  // Check cached scan
  const { data: existingScan } = await supabase.from('virus_scans').select('id, file_hash, is_malicious, positives, total_scans, virustotal_permalink, scanned_at').eq('file_hash', fileHash).gte('scanned_at', new Date(Date.now() - 86400000).toISOString()).order('scanned_at', { ascending: false }).limit(1).maybeSingle();

  if (existingScan) {
    return { cached: true, isMalicious: existingScan.is_malicious, positives: existingScan.positives, totalScans: existingScan.total_scans, permalink: existingScan.virustotal_permalink, scannedAt: existingScan.scanned_at };
  }

  // Scan (external lookups wrapped in withRetry via lookupGet)
  let scanResult: ScanResult | null = null;
  if (hybridAnalysisApiKey) scanResult = await scanWithHybridAnalysis(fileHash, hybridAnalysisApiKey, requestId);
  if (!scanResult && virusTotalApiKey) scanResult = await scanWithVirusTotal(fileHash, virusTotalApiKey, requestId);

  if (!scanResult) {
    return new Response(JSON.stringify({ error: 'Arquivo nao encontrado em nenhum servico de scan' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const { data: scanRecord } = await supabase.from('virus_scans').insert({
    agent_name: agentName, tenant_id: tenantId, file_hash: fileHash, file_path: filePath,
    scan_result: scanResult.scans, is_malicious: scanResult.isMalicious, positives: scanResult.positives,
    total_scans: scanResult.totalScans, virustotal_permalink: scanResult.permalink,
  }).select().order('scanned_at', { ascending: false }).limit(1).maybeSingle();

  await supabase.rpc('update_quota_usage', { p_tenant_id: tenantId, p_feature_key: 'advanced_scans_daily', p_delta: 1 });

  if (scanResult.isMalicious && scanRecord) {
    try {
      await supabase.functions.invoke('auto-quarantine', {
        headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
        body: { virus_scan_id: scanRecord.id, agent_name: agentName, file_path: filePath, file_hash: fileHash, positives: scanResult.positives, total_scans: scanResult.totalScans },
      });
    } catch (e) { logger.error('[SCAN-VIRUS] Auto-quarantine failed:', e); }
  }

  return { isMalicious: scanResult.isMalicious, positives: scanResult.positives, totalScans: scanResult.totalScans, permalink: scanResult.permalink, scanDate: scanResult.scanDate, scans: scanResult.scans, scannerUsed: scanResult.scannerUsed };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'scan-virus', maxRequests: 10, windowMinutes: 1, blockMinutes: 5 },
});