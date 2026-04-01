/**
 * scan-virus — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { checkQuotaAvailable } from '../_shared/quota.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const FETCH_TIMEOUT_MS = 30000;

const ScanVirusSchema = z.object({
  filePath: z.string().min(1).max(1024),
  fileHash: z.string().min(32).max(128).regex(/^[a-fA-F0-9]+$/),
});

interface ScanResult {
  isMalicious: boolean;
  positives: number;
  totalScans: number;
  permalink?: string;
  scanDate?: string;
  scans?: unknown;
  scannerUsed: 'hybrid_analysis' | 'virustotal';
}

async function scanWithHybridAnalysis(fileHash: string, apiKey: string): Promise<ScanResult | null> {
  try {
    const resp = await fetchWithTimeout(`https://www.hybrid-analysis.com/api/v2/report/${fileHash}/summary`, {
      timeoutMs: FETCH_TIMEOUT_MS, headers: { 'api-key': apiKey, 'User-Agent': 'CyberShield' },
    });
    if (resp.status === 404 || !resp.ok) return null;
    const data = await resp.json();
    const threatScore = data.threat_score || 0;
    const isMalicious = threatScore >= 50 || (data.verdict || '').includes('malicious');
    return { isMalicious, positives: isMalicious ? threatScore : 0, totalScans: 100, permalink: `https://www.hybrid-analysis.com/sample/${fileHash}`, scanDate: data.analysis_start_time, scans: data, scannerUsed: 'hybrid_analysis' };
  } catch (err) { logger.warn('[scan-virus] Hybrid Analysis scan failed', err); return null; }
}

async function scanWithVirusTotal(fileHash: string, apiKey: string): Promise<ScanResult | null> {
  try {
    const resp = await fetchWithTimeout(`https://www.virustotal.com/vtapi/v2/file/report?apikey=${apiKey}&resource=${fileHash}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.response_code !== 1) return null;
    return { isMalicious: data.positives > 0, positives: data.positives || 0, totalScans: data.total || 0, permalink: data.permalink, scanDate: data.scan_date, scans: data.scans, scannerUsed: 'virustotal' };
  } catch (err) { logger.warn('[scan-virus] VirusTotal scan failed', err); return null; }
}

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, body, requestId } = ctx;
  const { filePath, fileHash } = body as { filePath?: string; fileHash?: string };

  const hybridAnalysisApiKey = Deno.env.get('HYBRID_ANALYSIS_API_KEY');
  const virusTotalApiKey = Deno.env.get('VIRUSTOTAL_API_KEY');

  if (!hybridAnalysisApiKey && !virusTotalApiKey) {
    return new Response(JSON.stringify({ error: 'Nenhum servico de scan configurado' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  if (!filePath || !fileHash) {
    return new Response(JSON.stringify({ error: 'filePath e fileHash sao obrigatorios' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
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
  const { data: existingScan } = await supabase.from('virus_scans').select('*').eq('file_hash', fileHash).gte('scanned_at', new Date(Date.now() - 86400000).toISOString()).order('scanned_at', { ascending: false }).limit(1).maybeSingle();

  if (existingScan) {
    return { cached: true, isMalicious: existingScan.is_malicious, positives: existingScan.positives, totalScans: existingScan.total_scans, permalink: existingScan.virustotal_permalink, scannedAt: existingScan.scanned_at };
  }

  // Scan
  let scanResult: ScanResult | null = null;
  if (hybridAnalysisApiKey) scanResult = await scanWithHybridAnalysis(fileHash, hybridAnalysisApiKey);
  if (!scanResult && virusTotalApiKey) scanResult = await scanWithVirusTotal(fileHash, virusTotalApiKey);

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
